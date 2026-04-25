import os
import re
import json
import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# ── System prompts ──────────────────────────────────────────────────────────

COLLECTION_SYSTEM = """You are a friendly travel preference collector for a group trip planner.
Your job is to collect 3 fields from the user through casual conversation.

FIELDS TO COLLECT:
  1. available_dates: when they can travel (start and end, format YYYY-MM-DD)
  2. max_budget_flight: max flight budget in EUR (a number)
  3. trip_type: one or more of: city, beach, nature, culture, adventure

IMPORTANT RULES:
  - ALWAYS scan the user's message for ANY of the 3 fields, even if they give multiple at once
  - Only ask for fields that are still missing from "Current collected data"
  - NEVER ask again for fields already present in "Current collected data"
  - NEVER ask about trip duration — calculate it from dates automatically
  - Ask ONE question at a time for missing fields
  - Be warm, fun, conversational — like a friend planning a trip
  - If vague, ask a clarifying follow-up

After EVERY message, if you extracted any new field(s), append this JSON block at the very end of your reply (no markdown fences):
<!--EXTRACTED:{{"available_dates":null,"max_budget_flight":null,"trip_type":null}}-->
Only include fields you actually extracted in this turn.

When ALL 3 fields are collected, output ONLY this JSON and nothing else:
{{"status":"complete","preferences":{{"available_dates":{{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}},"max_budget_flight":0,"trip_type":[],"trip_duration":0}}}}
(trip_duration = end minus start in days)

Current collected data: {collected_so_far}"""


NEGOTIATION_SYSTEM = """You are a group travel mediator. Your job is to resolve conflicts between group members' travel preferences.

Group members and their preferences:
{members_json}

Conflicts detected:
{conflicts_json}

Your task:
1. Address each member BY NAME
2. Acknowledge what each person wants specifically
3. Propose 1-2 "bridge destinations" that satisfy the most important needs of everyone
4. Explain clearly WHY each destination works for EACH person
5. Ask each member if they accept the proposal or want to counter-propose

Be empathetic, specific, and constructive. Reference member names throughout.

End your message with this structured block (no markdown):
<!--PROPOSAL:{{"bridge_destinations":[],"conflict_summary":"","round":1}}-->"""


AGGREGATION_SYSTEM = """You are a group travel optimizer.
You receive travel preferences from multiple people and the pre-computed scores for each destination.

Group members: {members_json}
Pre-scored destinations (top candidates): {scored_json}
Skyscanner flight options: {flights_json}

Your task:
- Select the BEST destination (highest score, lowest variance = everyone happy)
- Write a "why" explanation mentioning each member by name
- Write a per-member justification ("why_per_member")
- Select the best flight option for the winner
- Provide an overall recommendation

Output ONLY this JSON (no markdown, no extra text):
{{"status":"success","conflicts":[],"top_destinations":[{{"city":"","country":"","score_avg":0,"score_variance":0,"scores_per_member":{{}},"why":"","why_per_member":{{}},"flight_option":{{"price":0,"airline":"","departure":"","link":""}},"co2_kg":0}}],"green_alternative":null,"recommendation":""}}"""


# ── JSON extraction ─────────────────────────────────────────────────────────

def _extract_json(text: str) -> dict | None:
    text = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _extract_comment_block(text: str, tag: str) -> dict | None:
    """Extract <!--TAG:{...}--> blocks from AI reply."""
    pattern = rf"<!--{tag}:(.*?)-->"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    return None


def _strip_comment_blocks(text: str) -> str:
    """Remove <!--...--> blocks from reply before showing to user."""
    return re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL).strip()


# ── Ollama calls ────────────────────────────────────────────────────────────

def _ollama_chat(system: str, messages: list[dict]) -> str:
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": False,
    }
    with httpx.Client(timeout=300) as client:
        r = client.post(f"{OLLAMA_URL}/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
        content = data.get("message", {}).get("content", "")
        if not content:
            raise ValueError(f"Empty response from Ollama: {data}")
        return content.strip()


def _ollama_stream(system: str, messages: list[dict]):
    """Generator that yields text chunks from Ollama streaming API."""
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": True,
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


# ── Public API ──────────────────────────────────────────────────────────────

def chat_turn(
    history: list[dict],
    user_message: str,
    collected_so_far: dict,
) -> tuple[str, dict | None, dict]:
    """
    Returns (reply_text, final_preferences_or_None, newly_extracted_partial_fields).
    reply_text has comment blocks stripped (clean for display).
    """
    system_prompt = COLLECTION_SYSTEM.format(
        collected_so_far=json.dumps(collected_so_far, ensure_ascii=False)
    )

    messages = []
    for msg in history:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["parts"][0]})
    messages.append({"role": "user", "content": user_message})

    raw_reply = _ollama_chat(system_prompt, messages)

    # Check for completion JSON
    parsed = _extract_json(raw_reply)
    if parsed and parsed.get("status") == "complete":
        clean = _strip_comment_blocks(raw_reply)
        return clean, parsed.get("preferences"), {}

    # Extract partial fields from <!--EXTRACTED:--> block
    partial = {}
    extracted = _extract_comment_block(raw_reply, "EXTRACTED")
    if extracted:
        partial = {k: v for k, v in extracted.items() if v is not None}

    clean = _strip_comment_blocks(raw_reply)
    return clean, None, partial


def chat_turn_stream(
    history: list[dict],
    user_message: str,
    collected_so_far: dict,
):
    """Generator yielding SSE-formatted chunks. Last chunk is a JSON summary."""
    system_prompt = COLLECTION_SYSTEM.format(
        collected_so_far=json.dumps(collected_so_far, ensure_ascii=False)
    )

    messages = []
    for msg in history:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["parts"][0]})
    messages.append({"role": "user", "content": user_message})

    full_text = ""
    for chunk in _ollama_stream(system_prompt, messages):
        full_text += chunk
        # Don't stream comment blocks to the client
        visible = _strip_comment_blocks(chunk)
        if visible:
            yield f"data: {json.dumps({'type':'chunk','text':visible})}\n\n"

    # Parse the complete response
    parsed = _extract_json(full_text)
    partial = {}
    final_prefs = None

    if parsed and parsed.get("status") == "complete":
        final_prefs = parsed.get("preferences")
    else:
        extracted = _extract_comment_block(full_text, "EXTRACTED")
        if extracted:
            partial = {k: v for k, v in extracted.items() if v is not None}

    yield f"data: {json.dumps({'type':'done','final_prefs':final_prefs,'partial':partial})}\n\n"


def negotiate(
    members: dict,   # {uid: {name, preferences}}
    conflicts: list[str],
    round_num: int = 1,
) -> str:
    """Generate a negotiation message for all members."""
    system_prompt = NEGOTIATION_SYSTEM.format(
        members_json=json.dumps(members, ensure_ascii=False, indent=2),
        conflicts_json=json.dumps(conflicts, ensure_ascii=False, indent=2),
    )
    raw = _ollama_chat(system_prompt, [
        {"role": "user", "content": f"Please mediate round {round_num} of our group travel negotiation."}
    ])
    return _strip_comment_blocks(raw)


def aggregate(
    group_preferences: dict,
    flights: list[dict],
    scored_destinations: list[dict],
    member_names: dict,  # {uid: name}
) -> dict:
    """Use AI to write the final narrative on top of pre-computed scores."""
    # Build member display info
    members_display = {
        uid: {
            "name": member_names.get(uid, uid),
            "preferences": prefs,
        }
        for uid, prefs in group_preferences.items()
    }

    system_prompt = AGGREGATION_SYSTEM.format(
        members_json=json.dumps(members_display, ensure_ascii=False, indent=2),
        scored_json=json.dumps(scored_destinations[:5], ensure_ascii=False, indent=2),
        flights_json=json.dumps(flights[:10], ensure_ascii=False, indent=2),
    )

    raw = _ollama_chat(system_prompt, [
        {"role": "user", "content": "Produce the final group decision JSON."}
    ])

    result = _extract_json(raw)
    if result is None:
        return {
            "status": "error",
            "conflicts": ["Could not parse AI response"],
            "top_destinations": [],
            "recommendation": "",
        }
    return result
