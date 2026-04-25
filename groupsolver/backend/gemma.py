import os
import re
import json
import httpx
from datetime import date

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")

# ── Ollama calls ─────────────────────────────────────────────────────────────

def _ollama_chat(system: str, messages: list[dict], tools: list[dict] | None = None) -> dict:
    """Returns the full message object (may include tool_calls)."""
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": False,
        "options": {"think": False},
    }
    # Only pass tools if model supports it (not gemma3)
    if tools and "gemma" not in MODEL.lower():
        payload["tools"] = tools
    with httpx.Client(timeout=300) as client:
        r = client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
        msg = data.get("message", {})
        if not msg:
            raise ValueError(f"Empty response from Ollama: {data}")
        return msg


def _ollama_stream(system: str, messages: list[dict]):
    """Generator yielding text chunks."""
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": True,
        "options": {"think": False},
    }
    with httpx.Client(timeout=300) as client:
        with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    delta = chunk.get("message", {}).get("content", "")
                    if delta:
                        yield delta
                    if chunk.get("done"):
                        break
                except json.JSONDecodeError:
                    continue


# ── JSON helpers ─────────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | None:
    text = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _strip_comment_blocks(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL).strip()


# ═══════════════════════════════════════════════════════════════════════════════
# POINT 1 — Tool-use based preference collection
# ═══════════════════════════════════════════════════════════════════════════════

_COLLECTION_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "save_preference",
            "description": "Save a travel preference field that was just extracted from the user's message.",
            "parameters": {
                "type": "object",
                "properties": {
                    "field": {
                        "type": "string",
                        "enum": ["available_dates", "max_budget_flight", "trip_type"],
                        "description": "Which preference field to save.",
                    },
                    "value": {
                        "description": "The value to save. For available_dates: {start, end} in YYYY-MM-DD. For max_budget_flight: a number. For trip_type: array of strings.",
                    },
                },
                "required": ["field", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mark_complete",
            "description": "Call this when ALL 3 fields (available_dates, max_budget_flight, trip_type) have been collected.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_clarification",
            "description": "Ask the user a follow-up question to clarify a vague or missing field.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "The question to ask the user."},
                    "field": {
                        "type": "string",
                        "enum": ["available_dates", "max_budget_flight", "trip_type"],
                        "description": "Which field this clarification is for.",
                    },
                },
                "required": ["question", "field"],
            },
        },
    },
]

_COLLECTION_SYSTEM = """You are a friend chatting about an upcoming trip you're planning together. You're excited and curious — NOT running a form or interview.

Your hidden goal: figure out three things naturally through conversation:
1. When is the person free to travel? (available_dates)
2. How much would they want to spend on the flight? (max_budget_flight)
3. What kind of trip vibe are they into? (trip_type — e.g. beach, city, nature, culture, adventure)

Rules:
- Always reply in English.
- Talk like a real person. React to what they say. Be warm, funny, genuine.
- Never list questions. Ask one thing at a time, embedded in a natural sentence.
- If they mention something relevant (like "I have two weeks off in July"), react to that first, then gently steer.
- Use save_preference the moment you extract a piece of info.
- Once all 3 are collected, call mark_complete().
- Don't say "I need to collect..." or "As a travel assistant...". Just be their friend planning the trip.

Already know: {collected_so_far}
Still figuring out: {missing_fields}"""


def _extract_prefs_from_text(user_message: str, bot_reply: str) -> dict:
    """Fallback extractor for small models that don't call tools reliably."""
    combined = (user_message + " " + bot_reply).lower()
    partial = {}

    # Dates: look for YYYY-MM-DD pairs
    date_matches = re.findall(r"\d{4}-\d{2}-\d{2}", combined)
    if len(date_matches) >= 2:
        partial["available_dates"] = {"start": date_matches[0], "end": date_matches[1]}
    elif len(date_matches) == 1:
        partial["available_dates"] = {"start": date_matches[0], "end": date_matches[0]}

    # Budget: look for numbers near euro/budget keywords
    budget_match = re.search(r"(\d+)\s*(?:€|eur|euros?)", combined)
    if not budget_match:
        budget_match = re.search(r"(?:budget|spend|cost|price)[^\d]*(\d+)", combined)
    if budget_match:
        partial["max_budget_flight"] = int(budget_match.group(1))

    # Trip type: keyword scan
    type_keywords = {
        "city": ["city", "urban", "ciudad", "metropol"],
        "beach": ["beach", "playa", "sea", "mar", "coast"],
        "nature": ["nature", "naturaleza", "mountain", "montaña", "hiking", "forest"],
        "culture": ["culture", "cultura", "museum", "history", "historia", "art"],
        "adventure": ["adventure", "aventura", "extreme", "sport", "activ"],
    }
    found_types = [t for t, kws in type_keywords.items() if any(k in combined for k in kws)]
    if found_types:
        partial["trip_type"] = found_types

    return partial


def chat_turn(
    history: list[dict],
    user_message: str,
    collected_so_far: dict,
) -> tuple[str, dict | None, dict]:
    """
    Tool-use based collection agent.
    Returns (reply_text, final_preferences_or_None, newly_extracted_partial_fields).
    """
    missing = [f for f in ["available_dates", "max_budget_flight", "trip_type"] if f not in collected_so_far]
    system = _COLLECTION_SYSTEM.format(
        collected_so_far=json.dumps(collected_so_far, ensure_ascii=False),
        missing_fields=missing,
    )

    messages = []
    for msg in history:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["parts"][0]})
    messages.append({"role": "user", "content": user_message})

    partial = {}
    complete = False
    reply_text = ""

    # Agentic loop: keep going while the model wants to call tools
    for _ in range(8):  # max 8 tool iterations per turn
        response_msg = _ollama_chat(system, messages, tools=_COLLECTION_TOOLS)
        tool_calls = response_msg.get("tool_calls", [])

        if not tool_calls:
            reply_text = response_msg.get("content", "").strip()
            reply_text = _strip_comment_blocks(reply_text)
            # Fallback: small models may not call tools, try to extract from text
            if not partial and not complete:
                partial.update(_extract_prefs_from_text(user_message, reply_text))
            break

        # Process each tool call
        messages.append(response_msg)  # add assistant message with tool_calls

        for call in tool_calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}

            tool_result = "ok"

            if name == "save_preference":
                field = args.get("field")
                value = args.get("value")
                if field and value is not None:
                    partial[field] = value

            elif name == "mark_complete":
                complete = True
                tool_result = "All preferences collected. Proceed to confirmation."

            elif name == "ask_clarification":
                # The question becomes the reply — we'll let the model reply naturally
                tool_result = "Clarification question registered."

            messages.append({
                "role": "tool",
                "content": tool_result,
            })

        if complete:
            # Ask model for a confirmation message
            messages.append({"role": "user", "content": "__confirm__"})
            final_msg = _ollama_chat(system, messages)
            reply_text = _strip_comment_blocks(final_msg.get("content", "Perfect, I have everything I need!"))
            break

    # Build final preferences if complete
    merged = {**collected_so_far, **partial}
    final_prefs = None

    if complete and all(f in merged for f in ["available_dates", "max_budget_flight", "trip_type"]):
        dates = merged.get("available_dates", {})
        trip_duration = 0
        if dates.get("start") and dates.get("end"):
            try:
                s = date.fromisoformat(dates["start"])
                e = date.fromisoformat(dates["end"])
                trip_duration = (e - s).days
            except ValueError:
                pass
        final_prefs = {
            "available_dates": dates,
            "max_budget_flight": merged.get("max_budget_flight", 0),
            "trip_type": merged.get("trip_type", []),
            "trip_duration": trip_duration,
        }

    return reply_text, final_prefs, partial


def chat_turn_stream(
    history: list[dict],
    user_message: str,
    collected_so_far: dict,
):
    """
    Streaming version — runs tool-use agent internally (blocking), streams result as SSE.
    Tool calls are not streamed; only the final reply text is.
    """
    reply_text, final_prefs, partial = chat_turn(history, user_message, collected_so_far)

    # Stream the reply word by word for a natural feel
    words = reply_text.split(" ")
    for i, word in enumerate(words):
        chunk = word + ("" if i == len(words) - 1 else " ")
        if chunk:
            yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'final_prefs': final_prefs, 'partial': partial})}\n\n"


# ═══════════════════════════════════════════════════════════════════════════════
# NEGOTIATION (unchanged logic, kept clean)
# ═══════════════════════════════════════════════════════════════════════════════

_NEGOTIATION_SYSTEM = """You are a friendly travel mediator helping two friends plan a trip together.

The two people and their preferences:
{members_json}

Conflicts detected:
{conflicts_json}

Write a short message (2-3 sentences max) TO BOTH OF THEM that:
1. Names the conflict directly using their names (e.g. "Ana wants beach, Carlos wants city — you two need to agree!")
2. Asks them what they're willing to change

Rules:
- Never say "group", "team", or "everyone" — there are only two people.
- Be casual and direct. No bullet points, no lists.
- Keep it under 3 sentences."""


def negotiate(members: dict, conflicts: list[str], round_num: int = 1) -> str:
    system = _NEGOTIATION_SYSTEM.format(
        members_json=json.dumps(members, ensure_ascii=False, indent=2),
        conflicts_json=json.dumps(conflicts, ensure_ascii=False, indent=2),
    )
    msg = _ollama_chat(system, [
        {"role": "user", "content": f"Please mediate round {round_num} of our group travel negotiation."}
    ])
    return _strip_comment_blocks(msg.get("content", ""))


_NEGOTIATION_EXTRACT_SYSTEM = """You are extracting updated travel preferences from a user's negotiation response.

Original preferences: {original_prefs}
Conflicts detected: {conflicts}
User's response: "{response}"

Extract any updated preferences the user agreed to. Only update fields they explicitly changed.
If they refused to change, keep the original value.

Output ONLY this JSON (no markdown):
{{"available_dates":{{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}},"max_budget_flight":0,"trip_type":[]}}"""


def extract_updated_preferences(original_prefs: dict, conflicts: list[str], response: str) -> dict | None:
    system = _NEGOTIATION_EXTRACT_SYSTEM.format(
        original_prefs=json.dumps(original_prefs, ensure_ascii=False, indent=2),
        conflicts=json.dumps(conflicts, ensure_ascii=False, indent=2),
        response=response,
    )
    try:
        msg = _ollama_chat(system, [{"role": "user", "content": "Extract updated preferences."}])
        updated = _extract_json(msg.get("content", ""))
        if not updated:
            return None
        merged = {**original_prefs, **{k: v for k, v in updated.items() if v}}
        dates = merged.get("available_dates", {})
        if dates.get("start") and dates.get("end"):
            try:
                s = date.fromisoformat(dates["start"])
                e = date.fromisoformat(dates["end"])
                merged["trip_duration"] = (e - s).days
            except ValueError:
                pass
        return merged
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# AGGREGATION — single LLM call for narratives (scoring already done by scoring.py)
# ═══════════════════════════════════════════════════════════════════════════════

_AGGREGATE_SYSTEM = """You are writing a travel recommendation for two friends planning a trip together.

The destinations are already ranked by a scoring engine. Your only job is to write human-readable text.

The two travellers and their preferences:
{members_json}

Top ranked destinations (in order):
{scored_json}

Output ONLY this JSON (no markdown, no explanation):
{{
  "why": "<2 sentences: why the #1 destination is the best pick for these two specific people, mention them by name>",
  "why_per_member": {{"<name>": "<1 sentence why they personally will love it>"}},
  "recommendation": "<1 warm sentence addressed to both of them by name>"
}}

Rules: never say "group", "team", or "everyone". These are two people, talk to them directly."""


def aggregate(
    group_preferences: dict,
    flights: list[dict],
    scored_destinations: list[dict],
    member_names: dict,
) -> dict:
    """Single-call aggregation: scoring.py does the math, LLM writes the story."""

    flight_by_city = {f.get("city", ""): f for f in flights}
    winner_dest = scored_destinations[0] if scored_destinations else {}

    # Build flight info for winner
    flight_for_winner = {}
    if winner_dest.get("city") in flight_by_city:
        f = flight_by_city[winner_dest["city"]]
        flight_for_winner = {
            "price": f.get("price", 0),
            "airline": f.get("airline", ""),
            "departure": f.get("departure", "TBD"),
            "link": f.get("link", ""),
        }

    # Build named members dict for the prompt
    named_members = {
        member_names.get(uid, uid): prefs
        for uid, prefs in group_preferences.items()
    }

    system = _AGGREGATE_SYSTEM.format(
        members_json=json.dumps(named_members, ensure_ascii=False, indent=2),
        scored_json=json.dumps(scored_destinations[:5], ensure_ascii=False, indent=2),
    )
    msg = _ollama_chat(system, [{"role": "user", "content": "Write the recommendation."}])
    narrative = _extract_json(msg.get("content", "")) or {}

    top_destinations = []
    for dest in scored_destinations[:5]:
        is_winner = dest.get("city") == winner_dest.get("city")
        top_destinations.append({
            **dest,
            "why": narrative.get("why", "") if is_winner else "Strong option for the group.",
            "why_per_member": narrative.get("why_per_member", {}) if is_winner else {},
            "flight_option": flight_for_winner if is_winner else flight_by_city.get(dest.get("city", ""), {}),
        })

    return {
        "status": "success",
        "conflicts": [],
        "top_destinations": top_destinations,
        "green_alternative": None,
        "recommendation": narrative.get("recommendation", ""),
        "member_analyses": {},
    }
