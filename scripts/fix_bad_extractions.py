#!/usr/bin/env python3
"""Fix the bad address extractions from the notes-based script."""
import json

INPUT = "public/spots.v1.json"

FIXES = {
    "mobile_chess_club": "West Regional Library, 5555 Grelot Rd, Mobile, AL",
    "fairbanks_community_chess_club": "Noel Wien Library, 1215 Cowles St, Fairbanks, AK",
    "chess_emporium": "7000 E Shea Blvd E-120, Scottsdale, AZ",
    "hamden_chess_club": "Play More Chess Academy, Hamden, CT",
    "del_chess": None,  # revert to no address - this was garbage
    "milford_chess_club": "Margaret Egan Center, Milford, DE",
    "springfield_chess_club": "White Oaks Mall Food Court, Springfield, IL",
    "baton_rouge_chess_club": "Jones Creek Library, Baton Rouge, LA",
    # Also fix these that were partly right but need cleanup
    "dayton_chess_society": "348 W First St, Dayton, OH",
    "columbia_chess_club": "6169 Saint Andrews Rd, Columbia, SC",
    "greenville_chess_club": "65 W Orchard Park Dr, Greenville, SC",
}

with open(INPUT) as f:
    spots = json.load(f)

for s in spots:
    sid = s.get("id")
    if sid in FIXES:
        new_addr = FIXES[sid]
        old_addr = s.get("address")
        if new_addr is None:
            if "address" in s:
                del s["address"]
            print(f"  REMOVED {sid}: was {old_addr!r}")
        else:
            s["address"] = new_addr
            print(f"  FIXED {sid}: {old_addr!r} -> {new_addr!r}")

with open(INPUT, "w") as f:
    json.dump(spots, f, indent=2, ensure_ascii=False)

print("\nDone.")
