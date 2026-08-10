#!/usr/bin/env python3
"""
Re-geocode all entries with real addresses, using address + city + state.
Update lat/lng to match the actual address location.
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

def simplify_address(addr):
    """Extract the first/primary address from complex address strings."""
    # Remove parenthetical notes
    addr = re.sub(r'\([^)]*\)', '', addr)
    # Take first address if multiple separated by semicolons or "Also"
    addr = re.split(r';|Also |Mon:|Tue:|Wed:|Thu:|Fri:|Sat:|Sun:|Mon |Tues|Wednes|Thurs|Fri |Satur|Sunda', addr)[0]
    # Remove "formerly" clauses
    addr = re.split(r'formerly|previously', addr, flags=re.I)[0]
    return addr.strip().rstrip(',;.')

def geocode(query):
    """Geocode using Nominatim."""
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": 1,
        "countrycodes": "us,pr",
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "chess-hotspot-coord-fix/1.0"
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"]), data[0].get("display_name", "")
    except Exception as e:
        pass
    return None

def haversine_miles(lat1, lon1, lat2, lon2):
    R = 3958.8
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

    print(f"Re-geocoding {len(to_check)} entries with city/state context...\n")

    updated = 0
    failed = 0
    already_good = 0
    skipped_intl = 0

    for i, s in enumerate(to_check):
        addr = s["address"]
        city = s.get("city", "")
        state = s.get("state", "")
        stored_lat = s["lat"]
        stored_lng = s["lng"]

        # Skip non-US entries
        if state and state not in ["AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL",
            "GA","HI","IA","ID","IL","IN","KS","KY","LA","MA","MD","ME","MI","MN",
            "MO","MS","MT","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR",
            "PA","PR","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"]:
            skipped_intl += 1
            continue

        # Build geocode query: simplify address + add city/state
        simple_addr = simplify_address(addr)

        # Check if address already has city/state/zip
        has_state = bool(re.search(r',\s*[A-Z]{2}\b', simple_addr))
        has_zip = bool(re.search(r'\b\d{5}\b', simple_addr))

        if has_state or has_zip:
            query = simple_addr
        elif city and state:
            query = f"{simple_addr}, {city}, {state}"
        elif state:
            query = f"{simple_addr}, {state}"
        else:
            query = simple_addr

        time.sleep(1.1)
        result = geocode(query)

        pct = (i + 1) / len(to_check) * 100
        if result is None:
            failed += 1
            print(f"  [{i+1}/{len(to_check)} {pct:.0f}%] FAIL: {s['id']} - query: {query}")
            continue

        geo_lat, geo_lng, display = result
        dist = haversine_miles(stored_lat, stored_lng, geo_lat, geo_lng)

        if dist < 0.5:
            already_good += 1
            if i % 25 == 0:
                print(f"  [{i+1}/{len(to_check)} {pct:.0f}%] OK ({dist:.1f}mi): {s['id']}")
            continue

        # Update coordinates
        old_lat, old_lng = s["lat"], s["lng"]
        s["lat"] = round(geo_lat, 6)
        s["lng"] = round(geo_lng, 6)
        updated += 1
        print(f"  [{i+1}/{len(to_check)} {pct:.0f}%] UPDATED ({dist:.1f}mi): {s['id']}")
        print(f"      old: ({old_lat}, {old_lng}) -> new: ({s['lat']}, {s['lng']})")
        print(f"      addr: {query}")
        print(f"      matched: {display[:100]}")

    print(f"\n=== SUMMARY ===")
    print(f"Total checked:    {len(to_check)}")
    print(f"Already good:     {already_good}")
    print(f"Updated coords:   {updated}")
    print(f"Geocode failures: {failed}")
    print(f"Skipped (intl):   {skipped_intl}")

    with open(INPUT, "w") as f:
        json.dump(spots, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {INPUT}")

if __name__ == "__main__":
    main()
