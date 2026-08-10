#!/usr/bin/env python3
"""
Geocode addresses and compare to stored lat/lng.
Flag entries where stored coords are more than 1 mile from the geocoded address.
Uses Nominatim (OpenStreetMap) with 1 req/sec rate limit.
"""
import json, re, time, math, urllib.request, urllib.parse

INPUT = "public/spots.v1.json"

def has_real_address(addr):
    if not addr:
        return False
    if re.search(r'\d+\s+\w', addr):
        return True
    if re.search(r'\b\d{5}\b', addr):
        return True
    return False

def geocode(address):
    """Geocode an address using Nominatim."""
    params = urllib.parse.urlencode({
        "q": address,
        "format": "json",
        "limit": 1,
        "addressdetails": 1,
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "chess-hotspot-address-verification/1.0"
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        return None
    return None

def haversine_miles(lat1, lon1, lat2, lon2):
    """Distance in miles between two lat/lng points."""
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))

def main():
    with open(INPUT) as f:
        spots = json.load(f)

    to_check = []
    for s in spots:
        addr = s.get("address")
        lat = s.get("lat")
        lng = s.get("lng")
        if has_real_address(addr) and lat is not None and lng is not None:
            to_check.append(s)

    print(f"Checking {len(to_check)} entries with real addresses and lat/lng...")
    print()

    mismatches = []
    geocode_failures = []
    matches = 0

    for i, s in enumerate(to_check):
        addr = s["address"]
        stored_lat = s["lat"]
        stored_lng = s["lng"]

        time.sleep(1.1)  # rate limit

        result = geocode(addr)
        pct = (i + 1) / len(to_check) * 100
        if result is None:
            geocode_failures.append(s["id"])
            print(f"  [{i+1}/{len(to_check)} {pct:.0f}%] GEOCODE FAIL: {s['id']} - {addr}")
            continue

        geo_lat, geo_lng = result
        dist = haversine_miles(stored_lat, stored_lng, geo_lat, geo_lng)

        if dist > 1.0:
            mismatches.append({
                "id": s["id"],
                "name": s.get("name"),
                "address": addr,
                "stored_lat": stored_lat,
                "stored_lng": stored_lng,
                "geocoded_lat": geo_lat,
                "geocoded_lng": geo_lng,
                "distance_miles": round(dist, 1),
            })
            print(f"  [{i+1}/{len(to_check)} {pct:.0f}%] MISMATCH {dist:.1f}mi: {s['id']} - stored ({stored_lat}, {stored_lng}) vs geocoded ({geo_lat}, {geo_lng}) - {addr}")
        else:
            matches += 1
            if i % 20 == 0:
                print(f"  [{i+1}/{len(to_check)} {pct:.0f}%] OK: {s['id']} ({dist:.1f}mi)")

    print(f"\n=== SUMMARY ===")
    print(f"Total checked:      {len(to_check)}")
    print(f"Matches (<1 mi):    {matches}")
    print(f"Mismatches (>1 mi): {len(mismatches)}")
    print(f"Geocode failures:   {len(geocode_failures)}")

    with open("/tmp/coord_mismatches.json", "w") as f:
        json.dump(mismatches, f, indent=2)

    if mismatches:
        print(f"\nMismatches saved to /tmp/coord_mismatches.json")
        print(f"\nTop mismatches by distance:")
        for m in sorted(mismatches, key=lambda x: -x["distance_miles"])[:20]:
            print(f"  {m['distance_miles']:>7.1f}mi  {m['id']}: {m['address']}")

if __name__ == "__main__":
    main()
