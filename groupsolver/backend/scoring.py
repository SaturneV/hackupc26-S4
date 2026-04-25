import json
import math
import os
from datetime import date
from typing import Optional

ICAO_FACTOR = 0.255  # kg CO2 per km per passenger

_DEST_PATH = os.path.join(os.path.dirname(__file__), "destinations.json")
with open(_DEST_PATH, encoding="utf-8") as f:
    DESTINATIONS: list[dict] = json.load(f)

DEST_BY_CITY = {d["city"]: d for d in DESTINATIONS}


def _geodesic_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine distance in km (no external dep needed)."""
    R = 6371.0
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def estimate_co2(origin_coords: list[float], dest_coords: list[float]) -> float:
    km = _geodesic_km(tuple(origin_coords), tuple(dest_coords))
    return round(km * ICAO_FACTOR, 1)


def score_destination(dest: dict, prefs: dict) -> int:
    """Score a destination 0-100 for a single member's preferences."""
    score = 0

    # Budget fit (0-40 pts): flight price vs member budget
    price = dest.get("price", dest.get("avg_price_eur", 999))
    budget = prefs.get("max_budget_flight", 0)
    if budget > 0:
        ratio = price / budget
        if ratio <= 0.5:
            score += 40
        elif ratio <= 0.75:
            score += 35
        elif ratio <= 1.0:
            score += 25
        elif ratio <= 1.2:
            score += 10
        # else 0

    # Travel type match (0-40 pts)
    member_types = set(prefs.get("trip_type", []))
    dest_types = set(dest.get("trip_types", dest.get("travel_types", [])))
    if member_types and dest_types:
        overlap = len(member_types & dest_types)
        total_wanted = len(member_types)
        score += int(40 * overlap / total_wanted)

    # Date availability / trip duration fit (0-20 pts)
    dates = prefs.get("available_dates", {})
    if dates.get("start") and dates.get("end"):
        try:
            start = date.fromisoformat(dates["start"])
            end = date.fromisoformat(dates["end"])
            duration = (end - start).days
            # Reward longer availability windows — more flexibility
            if duration >= 7:
                score += 20
            elif duration >= 4:
                score += 15
            elif duration >= 2:
                score += 10
            else:
                score += 5
        except ValueError:
            score += 10
    else:
        score += 10  # neutral if no dates

    return min(score, 100)


def _mean(vals: list[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def _stdev(vals: list[float]) -> float:
    if len(vals) < 2:
        return 0.0
    m = _mean(vals)
    return math.sqrt(sum((v - m) ** 2 for v in vals) / len(vals))


def group_decision(
    destinations: list[dict],
    all_member_prefs: dict,  # {uid: prefs_dict}
    origin_coords: Optional[list[float]] = None,
) -> list[dict]:
    """
    Score every destination for every member.
    Rank by: mean(scores) - 0.3 * stdev(scores)
    Returns list of dicts with full score breakdown + CO2.
    """
    uids = list(all_member_prefs.keys())
    results = []

    for dest in destinations:
        per_member: dict[str, int] = {}
        for uid in uids:
            per_member[uid] = score_destination(dest, all_member_prefs[uid])

        scores_list = list(per_member.values())
        avg = round(_mean(scores_list), 1)
        variance = round(_stdev(scores_list), 1)
        rank_score = avg - 0.3 * variance

        co2 = None
        if origin_coords and dest.get("coords"):
            co2 = estimate_co2(origin_coords, dest["coords"])

        results.append({
            "city": dest.get("city", ""),
            "country": dest.get("country", ""),
            "iata": dest.get("iata", ""),
            "coords": dest.get("coords"),
            "travel_types": dest.get("travel_types", dest.get("trip_types", [])),
            "avg_price_eur": dest.get("avg_price_eur", dest.get("price", 0)),
            "score_avg": avg,
            "score_variance": variance,
            "rank_score": rank_score,
            "scores_per_member": per_member,
            "co2_kg": co2,
        })

    results.sort(key=lambda d: d["rank_score"], reverse=True)
    return results


def find_green_alternative(
    ranked: list[dict],
    winner: dict,
    min_avg_score: float = 70.0,
) -> Optional[dict]:
    """Return lowest-CO2 dest with avg_score >= min_avg_score that isn't the winner."""
    candidates = [
        d for d in ranked
        if d["city"] != winner["city"]
        and d["score_avg"] >= min_avg_score
        and d.get("co2_kg") is not None
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda d: d["co2_kg"])
