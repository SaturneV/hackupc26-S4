import os
import json
import uuid
from datetime import datetime

USE_MOCK_DB = os.getenv("USE_MOCK_DB", "false").lower() == "true"

_mock: dict = {}
_db = None


def _get_db():
    global _db
    if USE_MOCK_DB:
        return None
    if _db is not None:
        return _db
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        if cred_json:
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
        else:
            raise RuntimeError("FIREBASE_CREDENTIALS_JSON not set")
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    _db = firestore.client()
    return _db


# ── Session ──────────────────────────────────────────────────────────────────

def create_session(
    member_count: int,
    origin_city: str = "Madrid",
    origin_coords: list | None = None,
    origin_iata: str = "MAD",
) -> str:
    session_id = str(uuid.uuid4())[:8].upper()
    data = {
        "member_count": member_count,
        "members": [],
        "status": "collecting",
        "created_at": datetime.utcnow().isoformat(),
        "origin_city": origin_city,
        "origin_coords": origin_coords or [40.4168, -3.7038],
        "origin_iata": origin_iata,
    }
    if USE_MOCK_DB:
        _mock[session_id] = {
            "_meta": data,
            "_prefs": {},
            "_result": None,
            "_negotiation": None,
        }
    else:
        _get_db().collection("sessions").document(session_id).set(data)
    return session_id


def get_session(session_id: str) -> dict | None:
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        return s["_meta"] if s else None
    doc = _get_db().collection("sessions").document(session_id).get()
    return doc.to_dict() if doc.exists else None


def join_session(session_id: str, username: str) -> str | None:
    user_id = str(uuid.uuid4())[:8]
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        if not s:
            return None
        s["_meta"]["members"].append(user_id)
        s["_prefs"][user_id] = {
            "username": username,
            "status": "chatting",
            "history": [],
            "collected_so_far": {},
            "preferences": None,
        }
        return user_id
    db = _get_db()
    ref = db.collection("sessions").document(session_id)
    from firebase_admin import firestore as _fs
    ref.update({"members": _fs.ArrayUnion([user_id])})
    ref.collection("preferences").document(user_id).set({
        "username": username,
        "status": "chatting",
        "history": [],
        "collected_so_far": {},
        "preferences": None,
    })
    return user_id


def set_session_status(session_id: str, status: str):
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        if s:
            s["_meta"]["status"] = status
        return
    _get_db().collection("sessions").document(session_id).update({"status": status})


def set_demo_bot_uids(session_id: str, bot_uids: list):
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        if s:
            s["_meta"]["demo_bot_uids"] = bot_uids
        return
    _get_db().collection("sessions").document(session_id).update({"demo_bot_uids": bot_uids})


# ── Preferences ──────────────────────────────────────────────────────────────

def get_preferences(session_id: str, user_id: str) -> dict | None:
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        return s["_prefs"].get(user_id) if s else None
    doc = (
        _get_db()
        .collection("sessions").document(session_id)
        .collection("preferences").document(user_id)
        .get()
    )
    return doc.to_dict() if doc.exists else None


def save_preferences(session_id: str, user_id: str, data: dict):
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        if s:
            s["_prefs"][user_id] = data
        return
    (
        _get_db()
        .collection("sessions").document(session_id)
        .collection("preferences").document(user_id)
        .set(data)
    )


def get_all_preferences(session_id: str) -> dict:
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        return s["_prefs"] if s else {}
    db = _get_db()
    docs = (
        db.collection("sessions").document(session_id)
        .collection("preferences").stream()
    )
    return {d.id: d.to_dict() for d in docs}


def check_all_done(session_id: str) -> bool:
    session = get_session(session_id)
    if not session:
        return False
    members = session.get("members", [])
    member_count = session.get("member_count", 0)
    if len(members) != member_count or member_count == 0:
        return False
    prefs = get_all_preferences(session_id)
    return all(prefs.get(uid, {}).get("status") == "done" for uid in members)


# ── Result ───────────────────────────────────────────────────────────────────

def save_result(session_id: str, result: dict):
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        if s:
            s["_result"] = result
            s["_meta"]["status"] = "done"
        return
    db = _get_db()
    db.collection("sessions").document(session_id).update({"status": "done"})
    (
        db.collection("sessions").document(session_id)
        .collection("result").document("data")
        .set(result)
    )


def get_result(session_id: str) -> dict | None:
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        return s["_result"] if s else None
    db = _get_db()
    doc = (
        db.collection("sessions").document(session_id)
        .collection("result").document("data")
        .get()
    )
    return doc.to_dict() if doc.exists else None


# ── Negotiation ──────────────────────────────────────────────────────────────

def save_negotiation_round(session_id: str, round_data: dict):
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        if s:
            s["_negotiation"] = round_data
        return
    (
        _get_db()
        .collection("sessions").document(session_id)
        .collection("negotiation").document("round_1")
        .set(round_data)
    )


def get_negotiation_round(session_id: str) -> dict | None:
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        return s.get("_negotiation") if s else None
    doc = (
        _get_db()
        .collection("sessions").document(session_id)
        .collection("negotiation").document("round_1")
        .get()
    )
    return doc.to_dict() if doc.exists else None


def save_negotiation_response(session_id: str, user_id: str, response: str):
    if USE_MOCK_DB:
        s = _mock.get(session_id)
        if s and s.get("_negotiation"):
            s["_negotiation"].setdefault("responses", {})[user_id] = response
        return
    ref = (
        _get_db()
        .collection("sessions").document(session_id)
        .collection("negotiation").document("round_1")
    )
    ref.update({f"responses.{user_id}": response})
