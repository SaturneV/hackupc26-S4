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

_COLLECTION_SYSTEM = """You are a friendly travel assistant helping someone plan a group trip.

You need exactly 3 things from the user. Ask ONLY for what is still missing:
- MISSING: {missing_fields}
- ALREADY HAVE: {collected_so_far}

RULES:
1. NEVER re-ask for something already in "ALREADY HAVE". Never. Not even to confirm.
2. If missing_fields is empty [], immediately write your confirmation and end with [DONE].
3. Ask for ALL missing fields in ONE short message (2-3 sentences max).
4. Be casual and warm, not robotic.
5. When the user answers, extract their info and if you now have everything, confirm briefly then end with [DONE] on its own line.
6. [DONE] means you have: travel dates, flight budget, and trip type. Nothing else required.

Example when all collected:
"Perfect! I've got everything I need — you're free April 14-21, budget €400, and you're into beach vibes. [DONE]"

The 3 fields:
- travel dates (when are they free, start and end date)
- flight budget (max euros for the flight)
- trip type (beach / city / nature / culture / adventure)"""


_MONTHS = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

def _parse_natural_dates(text: str) -> dict | None:
    """Parse natural language dates in Spanish and English into {start, end}."""
    from datetime import date as _date
    year = _date.today().year
    t = text.lower()

    # YYYY-MM-DD (strict ISO)
    iso = re.findall(r"\d{4}-\d{2}-\d{2}", t)
    if len(iso) >= 2:
        return {"start": iso[0], "end": iso[1]}
    if len(iso) == 1:
        return {"start": iso[0], "end": iso[0]}

    # "del 14 al 21 de abril" / "from 14 to 21 april" / "14-21 april"
    month_pat = "(" + "|".join(_MONTHS.keys()) + ")"
    m = re.search(
        rf"(?:del?|from|entre)?\s*(\d{{1,2}})\s*(?:al?|to|-|–)\s*(\d{{1,2}})\s*(?:de\s*)?{month_pat}",
        t,
    )
    if m:
        d1, d2, mon = int(m.group(1)), int(m.group(2)), _MONTHS[m.group(3)]
        try:
            return {
                "start": _date(year, mon, d1).isoformat(),
                "end":   _date(year, mon, d2).isoformat(),
            }
        except ValueError:
            pass

    # "14 abril - 21 abril" / "april 14 to april 21"
    m = re.search(
        rf"(\d{{1,2}})\s*(?:de\s*)?{month_pat}\s*(?:al?|to|-|–)\s*(\d{{1,2}})\s*(?:de\s*)?{month_pat}",
        t,
    )
    if m:
        d1, mon1, d2, mon2 = int(m.group(1)), _MONTHS[m.group(2)], int(m.group(3)), _MONTHS[m.group(4)]
        try:
            return {
                "start": _date(year, mon1, d1).isoformat(),
                "end":   _date(year, mon2, d2).isoformat(),
            }
        except ValueError:
            pass

    # "april 14" / "14 de abril" (single date)
    m = re.search(rf"(\d{{1,2}})\s*(?:de\s*)?{month_pat}", t)
    if not m:
        m = re.search(rf"{month_pat}\s*(\d{{1,2}})", t)
        if m:
            mon, day = _MONTHS[m.group(1)], int(m.group(2))
        else:
            mon = day = None
    else:
        day, mon = int(m.group(1)), _MONTHS[m.group(2)]
    if day and mon:
        try:
            d = _date(year, mon, day).isoformat()
            return {"start": d, "end": d}
        except ValueError:
            pass

    # "next week", "semana que viene", "semana santa" (approximate)
    from datetime import timedelta
    today = _date.today()
    if re.search(r"next week|semana que viene|la semana que viene", t):
        start = today + timedelta(days=(7 - today.weekday()))
        return {"start": start.isoformat(), "end": (start + timedelta(days=6)).isoformat()}
    if re.search(r"semana santa|easter", t):
        return {"start": f"{year}-04-14", "end": f"{year}-04-21"}
    if re.search(r"verano|summer", t):
        return {"start": f"{year}-07-01", "end": f"{year}-07-31"}

    return None


def _extract_prefs_from_text(user_message: str, bot_reply: str) -> dict:
    """Flexible extractor for models that don't call tools reliably."""
    combined = (user_message + " " + bot_reply).lower()
    partial = {}

    # Dates: natural language + ISO
    dates = _parse_natural_dates(combined)
    if dates:
        partial["available_dates"] = dates

    # Budget: flexible — "400€", "400 euros", "budget 400", "máximo 400", "hasta 400", "unos 400"
    budget_match = (
        re.search(r"(\d+)\s*(?:€|eur|euros?)", combined) or
        re.search(r"(?:budget|spend|cost|price|presupuesto|gasto|máximo|maximo|hasta|unos?|around|about)[^\d]*(\d+)", combined) or
        re.search(r"\b([1-9]\d{2,3})\b", combined)  # any 3-4 digit number as last resort
    )
    if budget_match:
        val = int(budget_match.group(1))
        if 50 <= val <= 9999:
            partial["max_budget_flight"] = val

    # Trip type: Spanish + English keywords
    type_keywords = {
        "city":      ["city", "urban", "ciudad", "metropol", "cities", "capital", "capitals"],
        "beach":     ["beach", "playa", "sea", "mar ", "coast", "coastal", "sand", "sol", "swimm"],
        "nature":    ["nature", "naturaleza", "mountain", "montaña", "hiking", "forest", "rural", "parque", "campo"],
        "culture":   ["culture", "cultura", "museum", "museo", "history", "historia", "art", "arte", "arquitectura"],
        "adventure": ["adventure", "aventura", "extreme", "sport", "activ", "ski", "climb", "escalar"],
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

    # Single LLM call — gemma3 doesn't do tool loops
    response_msg = _ollama_chat(system, messages, tools=_COLLECTION_TOOLS)
    tool_calls = response_msg.get("tool_calls", [])

    if tool_calls:
        # Tool-capable models (non-gemma): process tool calls
        messages.append(response_msg)
        for call in tool_calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            if name == "save_preference":
                field, value = args.get("field"), args.get("value")
                if field and value is not None:
                    partial[field] = value
            elif name == "mark_complete":
                complete = True
            messages.append({"role": "tool", "content": "ok"})
        if complete:
            final_msg = _ollama_chat(system, messages)
            reply_text = _strip_comment_blocks(final_msg.get("content", "Perfect, I have everything I need!"))
        else:
            followup = _ollama_chat(system, messages)
            reply_text = _strip_comment_blocks(followup.get("content", ""))
    else:
        # Text-only path (gemma3): extract from full conversation context
        reply_text = response_msg.get("content", "").strip()
        reply_text = _strip_comment_blocks(reply_text)

        # Extract from the user's message + entire history for maximum recall
        all_user_text = user_message + " " + " ".join(
            msg["parts"][0] for msg in history if msg["role"] == "user"
        )
        extracted = _extract_prefs_from_text(all_user_text, reply_text)
        for k, v in extracted.items():
            if k not in partial:
                partial[k] = v

        # Detect [DONE] marker the model was instructed to output
        if "[DONE]" in reply_text:
            complete = True
            reply_text = reply_text.replace("[DONE]", "").strip()

    # Build final preferences if complete
    merged = {**collected_so_far, **partial}
    final_prefs = None

    # Auto-complete when all 3 fields are present (works for any model)
    _required = ["available_dates", "max_budget_flight", "trip_type"]
    if not complete and all(f in merged for f in _required):
        complete = True

    if complete and all(f in merged for f in _required):
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


_PERSONAL_NEGOTIATION_SYSTEM = """You are a friendly travel mediator helping a group plan a trip together.

You are speaking directly and ONLY to {member_name}.

Their preferences:
{member_prefs_json}

The other group members and their preferences:
{others_json}

Conflicts detected:
{conflicts_json}

Write a short, personal message (2-3 sentences max) addressed directly to {member_name} that:
1. Opens with their first name
2. Names their specific conflict with the others (e.g. "you want beach but Ana wants city")
3. Proposes a concrete compromise they might consider (e.g. "would a coastal city like Barcelona work for you?")

Rules:
- Address only {member_name} — never say "everyone" or "the group"
- Be casual, warm, and direct
- Suggest an actual destination or middle-ground if possible
- Keep it under 3 sentences"""


def negotiate_for_member(
    member_uid: str,
    member_name: str,
    member_prefs: dict,
    all_members: dict,
    conflicts: list[str],
    round_num: int = 1,
) -> str:
    """Generate a personalized negotiation message for a single member."""
    others = {uid: info for uid, info in all_members.items() if uid != member_uid}
    system = _PERSONAL_NEGOTIATION_SYSTEM.format(
        member_name=member_name,
        member_prefs_json=json.dumps(member_prefs, ensure_ascii=False, indent=2),
        others_json=json.dumps(others, ensure_ascii=False, indent=2),
        conflicts_json=json.dumps(conflicts, ensure_ascii=False, indent=2),
    )
    try:
        msg = _ollama_chat(system, [
            {"role": "user", "content": f"Round {round_num}: write my personal negotiation message."}
        ])
        return _strip_comment_blocks(msg.get("content", ""))
    except Exception:
        conflict_summary = "; ".join(conflicts)
        return (
            f"Hey {member_name}, we found some conflicts: {conflict_summary}. "
            "What would you be willing to adjust?"
        )


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
