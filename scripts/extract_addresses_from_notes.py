#!/usr/bin/env python3
"""
Extract street addresses from notes field for entries that have lat/lng but no real address.
Also handles venue-only addresses by searching notes for better info.
"""
import json, re

INPUT = "public/spots.v1.json"

def looks_like_real_address(addr):
    if not addr:
        return False
    if re.search(r'\d+\s+\w', addr):
        return True
    if re.search(r'\b\d{5}\b', addr):
        return True
    return False

def extract_address_from_notes(notes):
    """Try to extract a street address from the notes field."""
    if not notes:
        return None

    street_suffixes = (
        r'(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|'
        r'Ln|Lane|Way|Ct|Court|Pl(?:ace)?|Pkwy|Parkway|Hwy|Highway|'
        r'Circle|Cir|Trail|Trl|Pike|Terrace|Ter|Row|Square|'
        r'Center|Mall|Campus|FM\s+\d+)'
    )

    # Pattern: number + street name + suffix, optionally followed by city, state, zip
    pattern = (
        r'(\d+[\w\-]*\s+'  # street number
        r'(?:[NSEW]\.?\s+)?'  # optional N/S/E/W prefix
        r'[\w\s\.\'\-]+?'  # street name
        r'\b' + street_suffixes + r'\b'  # street suffix
        r'(?:\s+(?:Suite|Ste|Apt|Unit|Bldg|#)\s*[\w\-]+)?'  # optional suite
        r'(?:[,\s]+[\w\s\.]+)?'  # optional city
        r'(?:[,\s]+[A-Z]{2})?'  # optional state
        r'(?:\s+\d{5}(?:-\d{4})?)?'  # optional zip
        r')'
    )

    match = re.search(pattern, notes, re.I)
    if match:
        addr = match.group(0).strip().rstrip('.,;:')
        # Clean up trailing prepositions or fragments
        addr = re.sub(r'\s+(at|in|on|from|to|for|and|or|the)\s*$', '', addr, flags=re.I)
        if len(addr) > 15:
            return addr

    return None

def main():
    with open(INPUT) as f:
        spots = json.load(f)

    updated = 0
    still_needs = []

    for s in spots:
        lat = s.get('lat')
        lng = s.get('lng')
        has_loc = lat is not None and lng is not None
        if not has_loc:
            continue
        if looks_like_real_address(s.get('address')):
            continue

        notes = s.get('notes', '')
        extracted = extract_address_from_notes(notes)

        if extracted:
            old_addr = s.get('address', '(none)')
            s['address'] = extracted
            updated += 1
            print(f"  UPDATED {s['id']}: {old_addr!r} -> {extracted!r}")
        else:
            skip_tag = " [SKIP]" if s.get("skip") else ""
            addr = s.get("address") or "(none)"
            still_needs.append({
                "id": s["id"],
                "name": s.get("name"),
                "addr": addr,
                "city": s.get("city"),
                "state": s.get("state"),
                "lat": lat,
                "lng": lng,
                "skip": s.get("skip", False),
                "notes_preview": notes[:200],
            })
            print(f"  STILL NEEDS{skip_tag} {s['id']}: addr={addr!r}")

    print(f"\n--- Summary ---")
    print(f"Updated from notes:  {updated}")
    print(f"Still need research: {len(still_needs)}")
    print(f"  of which skipped:  {sum(1 for x in still_needs if x['skip'])}")
    print(f"  active:            {sum(1 for x in still_needs if not x['skip'])}")

    with open(INPUT, "w") as f:
        json.dump(spots, f, indent=2, ensure_ascii=False)

    with open("/tmp/still_needs_research.json", "w") as f:
        json.dump(still_needs, f, indent=2)

    print(f"\nWrote {INPUT}")
    print(f"Wrote /tmp/still_needs_research.json")

if __name__ == "__main__":
    main()
