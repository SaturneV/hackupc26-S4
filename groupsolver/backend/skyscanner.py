import os
import httpx
from datetime import date

SKYSCANNER_API_KEY = os.getenv("SKYSCANNER_API_KEY", "")

MOCK_DESTINATIONS = [
    {"city": "Barcelona",  "country": "Spain",       "iata": "BCN", "price_eur": 89,  "airline": "Vueling",          "climate": "warm", "trip_types": ["beach","city","culture"],          "lat": 41.3874, "lon": 2.1686},
    {"city": "Lisbon",     "country": "Portugal",    "iata": "LIS", "price_eur": 75,  "airline": "TAP Air",          "climate": "warm", "trip_types": ["city","culture","beach"],           "lat": 38.7223, "lon": -9.1393},
    {"city": "Amsterdam",  "country": "Netherlands", "iata": "AMS", "price_eur": 110, "airline": "KLM",              "climate": "cold", "trip_types": ["city","culture"],                  "lat": 52.3676, "lon": 4.9041},
    {"city": "Prague",     "country": "Czechia",     "iata": "PRG", "price_eur": 95,  "airline": "Wizz Air",         "climate": "cold", "trip_types": ["city","culture"],                  "lat": 50.0755, "lon": 14.4378},
    {"city": "Rome",       "country": "Italy",       "iata": "FCO", "price_eur": 105, "airline": "Ryanair",          "climate": "warm", "trip_types": ["culture","city"],                  "lat": 41.9028, "lon": 12.4964},
    {"city": "Dubrovnik",  "country": "Croatia",     "iata": "DBV", "price_eur": 130, "airline": "Croatia Airlines", "climate": "warm", "trip_types": ["beach","city"],                    "lat": 42.6507, "lon": 18.0944},
    {"city": "Athens",     "country": "Greece",      "iata": "ATH", "price_eur": 115, "airline": "Aegean",           "climate": "warm", "trip_types": ["culture","beach","city"],           "lat": 37.9838, "lon": 23.7275},
    {"city": "Budapest",   "country": "Hungary",     "iata": "BUD", "price_eur": 80,  "airline": "Wizz Air",         "climate": "cold", "trip_types": ["city","culture"],                  "lat": 47.4979, "lon": 19.0402},
    {"city": "Vienna",     "country": "Austria",     "iata": "VIE", "price_eur": 100, "airline": "Austrian",         "climate": "cold", "trip_types": ["culture","city"],                  "lat": 48.2082, "lon": 16.3738},
    {"city": "Porto",      "country": "Portugal",    "iata": "OPO", "price_eur": 70,  "airline": "Ryanair",          "climate": "warm", "trip_types": ["city","culture","nature"],          "lat": 41.1579, "lon": -8.6291},
    {"city": "Paris",      "country": "France",      "iata": "CDG", "price_eur": 120, "airline": "Air France",       "climate": "cold", "trip_types": ["city","culture","adventure"],       "lat": 48.8566, "lon": 2.3522},
    {"city": "Berlin",     "country": "Germany",     "iata": "BER", "price_eur": 98,  "airline": "Eurowings",        "climate": "cold", "trip_types": ["city","culture","adventure"],       "lat": 52.5200, "lon": 13.4050},
    {"city": "Madrid",     "country": "Spain",       "iata": "MAD", "price_eur": 85,  "airline": "Iberia",           "climate": "warm", "trip_types": ["city","culture","adventure"],       "lat": 40.4168, "lon": -3.7038},
    {"city": "Milan",      "country": "Italy",       "iata": "MXP", "price_eur": 108, "airline": "easyJet",          "climate": "warm", "trip_types": ["city","culture","adventure"],       "lat": 45.4642, "lon": 9.1900},
    {"city": "Santorini",  "country": "Greece",      "iata": "JTR", "price_eur": 145, "airline": "Aegean",           "climate": "warm", "trip_types": ["beach","nature","adventure"],       "lat": 36.3932, "lon": 25.4615},
    {"city": "Reykjavik",  "country": "Iceland",     "iata": "KEF", "price_eur": 160, "airline": "Icelandair",       "climate": "cold", "trip_types": ["nature","adventure"],              "lat": 64.1355, "lon": -21.8954},
    {"city": "Zurich",     "country": "Switzerland", "iata": "ZRH", "price_eur": 135, "airline": "Swiss",            "climate": "cold", "trip_types": ["city","nature","adventure"],       "lat": 47.3769, "lon": 8.5417},
    {"city": "Copenhagen", "country": "Denmark",     "iata": "CPH", "price_eur": 118, "airline": "SAS",              "climate": "cold", "trip_types": ["city","culture","nature"],          "lat": 55.6761, "lon": 12.5683},
    {"city": "Seville",    "country": "Spain",       "iata": "SVQ", "price_eur": 82,  "airline": "Vueling",          "climate": "warm", "trip_types": ["city","culture","beach"],           "lat": 37.3891, "lon": -5.9845},
    {"city": "Valletta",   "country": "Malta",       "iata": "MLA", "price_eur": 92,  "airline": "Air Malta",        "climate": "warm", "trip_types": ["beach","culture","city"],           "lat": 35.8997, "lon": 14.5147},
]


def get_flights(origin: str = "MAD", depart_date: str | None = None,
                budget: int = 9999, adults: int = 1) -> list[dict]:
    if not SKYSCANNER_API_KEY:
        return _mock_flights(budget, origin)
    try:
        return _real_flights(origin, depart_date or str(date.today()), budget, adults)
    except Exception as e:
        print(f"[Skyscanner] real API failed: {e}, falling back to mock")
        return _mock_flights(budget, origin)


def _mock_flights(budget: int, origin: str = "MAD") -> list[dict]:
    results = []
    for d in MOCK_DESTINATIONS:
        if d["price_eur"] <= budget:
            results.append({
                "city": d["city"],
                "country": d["country"],
                "iata": d["iata"],
                "price": d["price_eur"],
                "airline": d["airline"],
                "climate": d["climate"],
                "trip_types": d["trip_types"],
                "lat": d["lat"],
                "lon": d["lon"],
                "departure": "TBD",
                "link": f"https://www.skyscanner.net/transport/flights/{origin}/{d['iata']}/",
            })
    return results


def _real_flights(origin: str, depart_date: str, budget: int, adults: int = 1) -> list[dict]:
    import time
    CREATE_URL = "https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/create"
    POLL_URL   = "https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/poll/{token}"
    headers = {"x-api-key": SKYSCANNER_API_KEY, "Content-Type": "application/json"}
    payload = {
        "query": {
            "market": "ES",
            "locale": "en-GB",
            "currency": "EUR",
            "queryLegs": [
                {
                    "originPlaceId": {"iata": origin},
                    "destinationPlaceId": {"everywhere": True},
                    "date": {
                        "year":  int(depart_date[:4]),
                        "month": int(depart_date[5:7]),
                        "day":   int(depart_date[8:10]),
                    },
                }
            ],
            "adults": adults,
            "cabinClass": "CABIN_CLASS_ECONOMY",
        }
    }

    with httpx.Client(timeout=30) as client:
        # Step 1: create search
        r = client.post(CREATE_URL, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()

        # Step 2: poll until complete (max 20s)
        token = data.get("sessionToken")
        if token:
            for _ in range(8):
                status = data.get("status", "")
                if status == "RESULT_STATUS_COMPLETE":
                    break
                time.sleep(2)
                r = client.post(POLL_URL.format(token=token), json={}, headers=headers)
                if r.status_code == 200:
                    data = r.json()

    content   = data.get("content", {})
    results   = content.get("results", {})
    itins     = results.get("itineraries", {})
    legs_map  = results.get("legs", {})
    places    = content.get("places", {})
    carriers  = content.get("carriers", {})

    flights = []
    for itin_id, itin in itins.items():
        # Price — amount is in minor units (pence/cents), divide by 100
        pricing = itin.get("pricingOptions", [])
        if not pricing:
            continue
        best = pricing[0]
        raw_price = best.get("price", {}).get("amount", 0)
        price_eur = int(raw_price) // 100

        if price_eur > budget:
            continue

        # Leg → destination place
        leg_id = (itin.get("legIds") or [None])[0]
        leg = legs_map.get(leg_id, {})
        dest_place_id = leg.get("destinationPlaceId", "")
        dest_place = places.get(dest_place_id, {})
        city    = dest_place.get("name", dest_place_id)
        country = places.get(dest_place.get("parentId", ""), {}).get("name", "")
        iata    = dest_place.get("iata", dest_place_id)

        # Departure datetime
        departure = leg.get("departureDateTime", {})
        dep_str = (
            f"{departure.get('year','?')}-{departure.get('month','?'):02}-{departure.get('day','?'):02} "
            f"{departure.get('hour','?'):02}:{departure.get('minute','?'):02}"
            if departure else "TBD"
        )

        # Airline — first marketing carrier on the first segment
        segments = leg.get("segmentIds", [])
        segs_map = results.get("segments", {})
        seg = segs_map.get(segments[0], {}) if segments else {}
        carrier_id = (seg.get("marketingCarrierId") or
                      (leg.get("operatingCarrierIds") or [None])[0])
        airline = carriers.get(carrier_id, {}).get("name", "Unknown airline")

        # Deep link from the pricing option
        link = best.get("items", [{}])[0].get("deepLink",
               f"https://www.skyscanner.net/transport/flights/{origin}/{iata}/")

        flights.append({
            "city":       city,
            "country":    country,
            "iata":       iata,
            "price":      price_eur,
            "airline":    airline,
            "climate":    "any",
            "trip_types": [],
            "lat":        dest_place.get("coordinates", {}).get("latitude", 0),
            "lon":        dest_place.get("coordinates", {}).get("longitude", 0),
            "departure":  dep_str,
            "link":       link,
        })

    flights.sort(key=lambda f: f["price"])
    return flights or _mock_flights(budget)
