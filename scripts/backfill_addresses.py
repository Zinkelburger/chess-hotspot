#!/usr/bin/env python3
"""Extract addresses from gmap URLs and backfill the address field."""

import json
import re
from urllib.parse import unquote, urlparse, parse_qs

INPUT = "public/spots.v1.json"

def extract_address_from_gmap(url):
    """Extract a human-readable address/place from a Google Maps URL."""
    if not url or url == "null":
        return None

    decoded = unquote(url)

    # maps/search/?api=1&query=...
    if "/maps/search/" in decoded:
        parsed = urlparse(decoded)
        qs = parse_qs(parsed.query)
        query = qs.get("query", [None])[0]
        if query:
            return query.replace("+", " ").strip()
        return None

    # maps/dir//PLACE+NAME,+ADDRESS/@lat,lng,...
    if "/maps/dir//" in decoded:
        match = re.search(r"/maps/dir//([^@]+?)(?:/@|$)", decoded)
        if match:
            raw = match.group(1).replace("+", " ").strip().rstrip("/")
            # Skip if it's just coordinates
            if re.match(r"^[\d.\-°\'\"NSEW, ]+$", raw):
                return None
            # Clean up pipe separators
            raw = raw.replace(" | ", ", ")
            return raw
        return None

    # maps/place/PLACE+NAME/@lat,lng,...  or maps/place/ADDRESS
    if "/maps/place/" in decoded:
        match = re.search(r"/maps/place/([^@]+?)(?:/@|$|\?)", decoded)
        if match:
            raw = match.group(1).replace("+", " ").strip().rstrip("/")
            # Skip if it's coordinate notation like 42°22'23.3"N
            if re.search(r"\d+°\d+", raw) or re.search(r"\d+%C2%B0", raw):
                return None
            if re.match(r"^[\d.\-°\'\"NSEW, ]+$", raw):
                return None
            return raw
        return None

    # maps?... &daddr=ADDRESS
    if "daddr=" in decoded:
        match = re.search(r"daddr=([^&]+)", decoded)
        if match:
            raw = match.group(1).replace("+", " ").strip()
            if re.match(r"^[\d.\-°\'\"NSEW, ]+$", raw):
                return None
            return raw
        return None

    return None


def main():
    with open(INPUT, "r") as f:
        spots = json.load(f)

    updated = 0
    skipped_already_has = 0
    skipped_no_gmap = 0
    skipped_no_extract = 0

    for spot in spots:
        gmap = spot.get("gmap")
        if not gmap:
            skipped_no_gmap += 1
            continue

        if spot.get("address"):
            skipped_already_has += 1
            continue

        addr = extract_address_from_gmap(gmap)
        if not addr:
            skipped_no_extract += 1
            print(f"  SKIP (can't extract): {spot.get('id')} -> {gmap[:80]}...")
            continue

        spot["address"] = addr
        updated += 1
        print(f"  SET: {spot.get('id')} -> {addr}")

    print(f"\n--- Summary ---")
    print(f"Updated:               {updated}")
    print(f"Already had address:   {skipped_already_has}")
    print(f"No gmap URL:           {skipped_no_gmap}")
    print(f"Could not extract:     {skipped_no_extract}")
    print(f"Total entries:         {len(spots)}")

    with open(INPUT, "w") as f:
        json.dump(spots, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {INPUT}")


if __name__ == "__main__":
    main()
