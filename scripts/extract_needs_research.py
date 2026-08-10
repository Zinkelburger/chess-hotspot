#!/usr/bin/env python3
"""Extract entries that have lat/lng but no real street address."""
import json, re

with open("public/spots.v1.json") as f:
    spots = json.load(f)

def looks_like_real_address(addr):
    if not addr:
        return False
    if re.search(r'\d+\s+\w', addr):
        return True
    if re.search(r'\b\d{5}\b', addr):
        return True
    return False

def has_street_in_text(text):
    if not text:
        return False
    return bool(re.search(
        r'\d+\s+\w+\s+(St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl|Pkwy|Hwy|Street|Avenue|Boulevard|Road|Drive|Lane|Circle|Trail|Pike)\b',
        text, re.I
    ))

needs_research = []
for s in spots:
    lat = s.get('lat')
    lng = s.get('lng')
    addr = s.get('address')
    has_loc = lat is not None and lng is not None
    if not has_loc:
        continue
    if looks_like_real_address(addr):
        continue
    needs_research.append(s)

with open("/tmp/needs_address_research.json", "w") as f:
    json.dump([{
        "id": s.get("id"),
        "name": s.get("name"),
        "lat": s.get("lat"),
        "lng": s.get("lng"),
        "address": s.get("address"),
        "city": s.get("city"),
        "state": s.get("state"),
        "notes": (s.get("notes") or "")[:300],
        "skip": s.get("skip", False),
    } for s in needs_research], f, indent=2)

print(f"Total entries needing research: {len(needs_research)}")
print(f"Skipped entries in this set: {sum(1 for e in needs_research if e.get('skip'))}")
print(f"Active (not skipped): {sum(1 for e in needs_research if not e.get('skip'))}")
print()

addr_in_notes = [e for e in needs_research if has_street_in_text(e.get("notes"))]
print(f"Entries with street address already in notes: {len(addr_in_notes)}")
for e in addr_in_notes:
    notes = (e.get("notes") or "")[:150]
    print(f"  {e['id']}: {notes}")
print()

no_addr_in_notes = [e for e in needs_research if not has_street_in_text(e.get("notes"))]
print(f"Entries that truly need browser research: {len(no_addr_in_notes)}")
for e in no_addr_in_notes:
    skip_tag = " [SKIP]" if e.get("skip") else ""
    addr = e.get("address") or "(none)"
    city = e.get("city", "?")
    state = e.get("state", "?")
    notes_preview = (e.get("notes") or "")[:120]
    print(f"  {e['id']}{skip_tag}: addr={addr!r} | {city}, {state} | ({e['lat']}, {e['lng']})")
    if notes_preview:
        print(f"    notes: {notes_preview}")
