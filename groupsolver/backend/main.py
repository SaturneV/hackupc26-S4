import os
import asyncio
from datetime import datetime, date
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import firebase as db
import gemma
import skyscanner as sky
import scoring


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="GroupSolver API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ──────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    member_count: int
    origin_city: str = "Madrid"
    origin_coords: list[float] = [40.4168, -3.7038]

class JoinSessionRequest(BaseModel):
    username: str

class ChatRequest(BaseModel):
    message: str

class NegotiateResponseRequest(BaseModel):
    response: str  # member's response to negotiation proposal


# ── Aggregation lock ─────────────────────────────────────────────────────────

_aggregating: set[str] = set()


def _detect_conflicts(group_prefs: dict, member_names: dict | None = None) -> list[str]:
    """Detect conflicts across member preferences: dates, trip_type, budget."""
    conflicts = []
    names = member_names or {}
    all_types = {}
    all_budgets = []
    date_ranges = {}

    for uid, prefs in group_prefs.items():
        types = set(prefs.get("trip_type", []))
        budget = prefs.get("max_budget_flight", 0)
        dates = prefs.get("available_dates", {})
        if types:
            all_types[uid] = types
        if budget:
            all_budgets.append((uid, budget))
        if dates and dates.get("start") and dates.get("end"):
            try:
                date_ranges[uid] = (
                    date.fromisoformat(dates["start"]),
                    date.fromisoformat(dates["end"]),
                )
            except ValueError:
                pass

    # Date conflict: no overlapping window across all members
    if len(date_ranges) >= 2:
        uids = list(date_ranges)
        overlap_start = max(v[0] for v in date_ranges.values())
        overlap_end = min(v[1] for v in date_ranges.values())
        if overlap_start > overlap_end:
            parts = []
            for uid, (s, e) in date_ranges.items():
                label = names.get(uid, uid)
                parts.append(f"{label}: {s.strftime('%d %b')}–{e.strftime('%d %b')}")
            conflicts.append(
                f"Date mismatch — no common travel window: {', '.join(parts)}"
            )

    # Type conflict: no common type across all members
    if len(all_types) >= 2:
        common = set.intersection(*all_types.values())
        if not common:
            type_list = ", ".join(
                f"{names.get(uid, uid)}: {'/'.join(sorted(t))}"
                for uid, t in all_types.items()
            )
            conflicts.append(f"No overlapping travel type: {type_list}")

    # Budget conflict: spread > 50%
    if len(all_budgets) >= 2:
        budgets_only = [b for _, b in all_budgets]
        lo, hi = min(budgets_only), max(budgets_only)
        if lo > 0 and (hi - lo) / lo > 0.5:
            lo_name = names.get(next(uid for uid, b in all_budgets if b == lo), "")
            hi_name = names.get(next(uid for uid, b in all_budgets if b == hi), "")
            conflicts.append(
                f"Budget spread too wide: {lo_name} €{lo} vs {hi_name} €{hi}"
            )

    return conflicts


async def _check_and_proceed(session_id: str):
    """Called when all members finish chat. Runs negotiation if conflicts, else aggregates."""
    all_prefs_raw = db.get_all_preferences(session_id)
    group = {
        uid: p["preferences"]
        for uid, p in all_prefs_raw.items()
        if p.get("preferences")
    }
    member_names = {uid: p.get("username", uid) for uid, p in all_prefs_raw.items()}

    conflicts = _detect_conflicts(group, member_names)

    if conflicts:
        members_for_ai = {
            uid: {"name": member_names.get(uid, uid), "preferences": prefs}
            for uid, prefs in group.items()
        }

        def _do_negotiate():
            try:
                return gemma.negotiate(members_for_ai, conflicts)
            except Exception:
                import traceback; traceback.print_exc()
                return (
                    "Hemos detectado incompatibilidades en las preferencias del grupo. "
                    f"Problemas: {'; '.join(conflicts)}. "
                    "Por favor, negociad y decidid si podéis ajustar vuestras preferencias."
                )

        message = await asyncio.get_event_loop().run_in_executor(None, _do_negotiate)

        round_data = {
            "round": 1,
            "conflicts": conflicts,
            "proposal_message": message,
            "responses": {},
        }
        db.save_negotiation_round(session_id, round_data)
        db.set_session_status(session_id, "negotiating")
    else:
        asyncio.create_task(_run_aggregation(session_id))


async def _run_aggregation(session_id: str):
    if session_id in _aggregating:
        return
    _aggregating.add(session_id)
    db.set_session_status(session_id, "aggregating")

    try:
        def _do():
            all_prefs_raw = db.get_all_preferences(session_id)
            session_meta = db.get_session(session_id)
            origin_coords = session_meta.get("origin_coords", [40.4168, -3.7038])
            origin_iata = session_meta.get("origin_iata", "MAD")

            group = {
                uid: p["preferences"]
                for uid, p in all_prefs_raw.items()
                if p.get("preferences")
            }
            member_names = {
                uid: p.get("username", uid)
                for uid, p in all_prefs_raw.items()
            }

            budget = min(
                (p.get("max_budget_flight", 9999) for p in group.values()),
                default=500,
            )

            # Get flights
            flights = sky.get_flights(origin=origin_iata, budget=budget)

            # Pre-compute scores using our deterministic engine
            # Merge destination data with flight prices
            dest_map = {d["city"]: d for d in scoring.DESTINATIONS}
            for f in flights:
                city = f.get("city")
                if city in dest_map:
                    dest_map[city] = {**dest_map[city], "price": f["price"]}

            ranked = scoring.group_decision(
                list(dest_map.values()), group, origin_coords
            )

            # Attach flight info to ranked destinations
            flight_by_city = {f["city"]: f for f in flights}
            for dest in ranked:
                city = dest["city"]
                if city in flight_by_city:
                    f = flight_by_city[city]
                    dest["flight_option"] = {
                        "price": f["price"],
                        "airline": f.get("airline", ""),
                        "departure": f.get("departure", "TBD"),
                        "link": f.get("link", ""),
                    }

            winner = ranked[0] if ranked else None
            green_alt = None
            if winner:
                green_alt = scoring.find_green_alternative(ranked, winner)

            # Ask AI to generate narrative on top of our scores
            ai_result = gemma.aggregate(group, flights, ranked[:5], member_names)

            # Merge AI narrative with our computed scores
            top3 = []
            for i, dest in enumerate(ranked[:5]):
                ai_dest = {}
                if ai_result.get("top_destinations") and i < len(ai_result["top_destinations"]):
                    ai_dest = ai_result["top_destinations"][i]

                top3.append({
                    **dest,
                    "why": ai_dest.get("why", ""),
                    "why_per_member": ai_dest.get("why_per_member", {}),
                    "flight_option": dest.get("flight_option") or ai_dest.get("flight_option"),
                })

            conflicts = _detect_conflicts(group)
            result = {
                "status": "success",
                "conflicts": conflicts,
                "top_destinations": top3,
                "green_alternative": {
                    **green_alt,
                    "delta_price": (green_alt.get("avg_price_eur", 0) - (winner.get("avg_price_eur") or 0))
                    if green_alt else None,
                    "delta_co2": (green_alt.get("co2_kg", 0) - (winner.get("co2_kg") or 0))
                    if green_alt and winner.get("co2_kg") else None,
                } if green_alt else None,
                "recommendation": ai_result.get("recommendation", ""),
                "generated_at": datetime.utcnow().isoformat(),
            }
            db.save_result(session_id, result)

        await asyncio.wait_for(asyncio.get_event_loop().run_in_executor(None, _do), timeout=300)

    except asyncio.TimeoutError:
        db.set_session_status(session_id, "error")
        db.save_result(session_id, {
            "status": "error",
            "conflicts": ["Aggregation timed out"],
            "top_destinations": [],
            "recommendation": "",
        })
    except Exception as e:
        import traceback; traceback.print_exc()
        db.set_session_status(session_id, "error")
        db.save_result(session_id, {
            "status": "error",
            "conflicts": [str(e)],
            "top_destinations": [],
            "recommendation": "",
        })
    finally:
        _aggregating.discard(session_id)


# ── Routes ───────────────────────────────────────────────────────────────────

@app.post("/session/create")
async def create_session(body: CreateSessionRequest):
    if body.member_count < 1 or body.member_count > 20:
        raise HTTPException(400, "member_count must be 1-20")
    session_id = db.create_session(
        body.member_count,
        origin_city=body.origin_city,
        origin_coords=body.origin_coords,
    )
    return {"session_id": session_id}


@app.post("/session/{session_id}/join")
async def join_session(session_id: str, body: JoinSessionRequest):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.get("status") not in ("collecting",):
        raise HTTPException(400, f"Session is {session.get('status')}, cannot join")
    if len(session.get("members", [])) >= session.get("member_count", 0):
        raise HTTPException(400, "Session is full")
    user_id = db.join_session(session_id, body.username)
    if not user_id:
        raise HTTPException(500, "Could not join session")
    return {"user_id": user_id, "session_id": session_id}


@app.get("/session/{session_id}")
async def get_session(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    all_prefs = db.get_all_preferences(session_id)
    members_info = [
        {
            "user_id": uid,
            "username": p.get("username", ""),
            "status": p.get("status", "chatting"),
        }
        for uid, p in all_prefs.items()
    ]
    return {**session, "members_info": members_info}


@app.post("/session/{session_id}/member/{user_id}/chat")
async def chat(session_id: str, user_id: str, body: ChatRequest):
    """Standard (non-streaming) chat endpoint."""
    pref_doc = db.get_preferences(session_id, user_id)
    if not pref_doc:
        raise HTTPException(404, "User not found in session")
    if pref_doc.get("status") == "done":
        return {"reply": "You've already completed your preferences! Waiting for others.", "done": True}

    history = pref_doc.get("history", [])
    collected = pref_doc.get("collected_so_far", {})

    try:
        reply, parsed_prefs, partial = gemma.chat_turn(history, body.message, collected)
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(500, f"AI error: {e}")

    history.append({"role": "user", "parts": [body.message]})
    history.append({"role": "model", "parts": [reply]})

    updates = {**pref_doc, "history": history}

    if parsed_prefs:
        # Auto-calculate trip_duration from dates
        dates = parsed_prefs.get("available_dates", {})
        if dates.get("start") and dates.get("end") and not parsed_prefs.get("trip_duration"):
            try:
                start = date.fromisoformat(dates["start"])
                end = date.fromisoformat(dates["end"])
                parsed_prefs["trip_duration"] = (end - start).days
            except ValueError:
                pass
        updates["preferences"] = parsed_prefs
        updates["status"] = "done"
        updates["collected_so_far"] = parsed_prefs
    else:
        new_collected = {**collected, **partial}
        updates["collected_so_far"] = new_collected

    db.save_preferences(session_id, user_id, updates)

    if parsed_prefs and db.check_all_done(session_id):
        asyncio.create_task(_check_and_proceed(session_id))

    return {"reply": reply, "done": bool(parsed_prefs)}


@app.post("/session/{session_id}/member/{user_id}/chat/stream")
async def chat_stream(session_id: str, user_id: str, body: ChatRequest):
    """Streaming SSE chat endpoint."""
    pref_doc = db.get_preferences(session_id, user_id)
    if not pref_doc:
        raise HTTPException(404, "User not found in session")
    if pref_doc.get("status") == "done":
        async def _already_done():
            import json
            yield f"data: {json.dumps({'type':'chunk','text':'You have already completed your preferences!'})}\n\n"
            yield f"data: {json.dumps({'type':'done','final_prefs':None,'partial':{}})}\n\n"
        return StreamingResponse(_already_done(), media_type="text/event-stream")

    history = pref_doc.get("history", [])
    collected = pref_doc.get("collected_so_far", {})

    full_reply_parts = []
    final_prefs_holder = [None]
    partial_holder = [{}]

    async def _generate():
        import json as _json
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _run():
            try:
                for event in gemma.chat_turn_stream(history, body.message, collected):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        loop.run_in_executor(None, _run)

        full_text = ""
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
            # Accumulate for DB save
            try:
                parsed = _json.loads(item[len("data: "):].strip())
                if parsed.get("type") == "chunk":
                    full_text += parsed.get("text", "")
                elif parsed.get("type") == "done":
                    final_prefs_holder[0] = parsed.get("final_prefs")
                    partial_holder[0] = parsed.get("partial", {})
            except Exception:
                pass

        # Save to DB
        new_history = history + [
            {"role": "user", "parts": [body.message]},
            {"role": "model", "parts": [full_text]},
        ]
        updates = {**pref_doc, "history": new_history}
        parsed_prefs = final_prefs_holder[0]
        partial = partial_holder[0]

        if parsed_prefs:
            dates = parsed_prefs.get("available_dates", {})
            if dates.get("start") and dates.get("end") and not parsed_prefs.get("trip_duration"):
                try:
                    s = date.fromisoformat(dates["start"])
                    e = date.fromisoformat(dates["end"])
                    parsed_prefs["trip_duration"] = (e - s).days
                except ValueError:
                    pass
            updates["preferences"] = parsed_prefs
            updates["status"] = "done"
            updates["collected_so_far"] = parsed_prefs
        else:
            updates["collected_so_far"] = {**collected, **partial}

        db.save_preferences(session_id, user_id, updates)

        if parsed_prefs and db.check_all_done(session_id):
            asyncio.create_task(_check_and_proceed(session_id))

    return StreamingResponse(_generate(), media_type="text/event-stream")


@app.get("/session/{session_id}/negotiation-round")
async def get_negotiation_round(session_id: str):
    """Return the current negotiation round data (proposal message + responses)."""
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    round_data = db.get_negotiation_round(session_id)
    if not round_data:
        raise HTTPException(404, "No negotiation round active")
    return round_data


@app.post("/session/{session_id}/negotiate")
async def trigger_negotiation(session_id: str):
    """Detect conflicts and generate a negotiation message."""
    all_prefs = db.get_all_preferences(session_id)
    group = {
        uid: p["preferences"]
        for uid, p in all_prefs.items()
        if p.get("preferences")
    }
    if len(group) < 2:
        raise HTTPException(400, "Need at least 2 members with preferences to negotiate")

    conflicts = _detect_conflicts(group)
    members_for_ai = {
        uid: {
            "name": all_prefs[uid].get("username", uid),
            "preferences": prefs,
        }
        for uid, prefs in group.items()
    }

    try:
        message = gemma.negotiate(members_for_ai, conflicts)
    except Exception as e:
        raise HTTPException(500, f"Negotiation AI error: {e}")

    round_data = {
        "round": 1,
        "conflicts": conflicts,
        "proposal_message": message,
        "responses": {},
    }
    db.save_negotiation_round(session_id, round_data)
    db.set_session_status(session_id, "negotiating")

    return {"message": message, "conflicts": conflicts}


@app.post("/session/{session_id}/member/{user_id}/negotiate-response")
async def negotiate_response(session_id: str, user_id: str, body: NegotiateResponseRequest):
    """Record a member's response to a negotiation proposal."""
    db.save_negotiation_response(session_id, user_id, body.response)
    session = db.get_session(session_id)
    all_prefs = db.get_all_preferences(session_id)

    # Check if everyone responded
    round_data = db.get_negotiation_round(session_id)
    if round_data:
        responses = round_data.get("responses", {})
        members = session.get("members", [])
        if all(uid in responses for uid in members):
            # Everyone responded — run aggregation
            asyncio.create_task(_run_aggregation(session_id))

    return {"ok": True}


@app.post("/session/{session_id}/solve")
async def force_solve(session_id: str):
    """Manually trigger final aggregation (admin use)."""
    asyncio.create_task(_run_aggregation(session_id))
    return {"ok": True, "message": "Aggregation started"}


@app.get("/session/{session_id}/result")
async def get_result_new(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    result = db.get_result(session_id)
    return {"session_status": session.get("status"), "result": result}


# Legacy endpoint aliases for frontend compatibility
@app.post("/chat/{session_id}/{user_id}")
async def chat_legacy(session_id: str, user_id: str, body: ChatRequest):
    return await chat(session_id, user_id, body)


@app.get("/results/{session_id}")
async def get_results_legacy(session_id: str):
    return await get_result_new(session_id)


@app.get("/debug/{session_id}")
async def debug_session(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    all_prefs = db.get_all_preferences(session_id)
    members = {
        uid: {
            "username": pref.get("username", ""),
            "status": pref.get("status", ""),
            "collected_so_far": pref.get("collected_so_far", {}),
            "preferences": pref.get("preferences"),
            "message_count": len(pref.get("history", [])),
        }
        for uid, pref in all_prefs.items()
    }
    return {
        "session": session,
        "members": members,
        "result": db.get_result(session_id),
    }
