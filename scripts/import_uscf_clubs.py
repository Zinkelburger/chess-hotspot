#!/usr/bin/env python3
"""One-time import: add all scraped USCF clubs to spots.v1.json with blank fields.

Clubs are added with null lat/lng/photo/gmap so the fill script can populate
them later. Website is carried over from the scrape when available. Clubs
already in spots.v1.json (by name, case-insensitive) are skipped.

Usage:
    python3 scripts/import_uscf_clubs.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

USCF_PATH = Path("data/uscf_clubs.json")
SPOTS_PATH = Path("public/spots.v1.json")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "club"


def main() -> None:
    if not USCF_PATH.exists():
        print(f"Not found: {USCF_PATH}", file=sys.stderr)
        sys.exit(1)

    uscf_data: dict[str, list[dict]] = json.loads(
        USCF_PATH.read_text(encoding="utf-8")
    )
    spots: list[dict] = (
        json.loads(SPOTS_PATH.read_text(encoding="utf-8"))
        if SPOTS_PATH.exists()
        else []
    )

    existing_names = {s["name"].strip().lower() for s in spots if s.get("name")}
    existing_ids = {s["id"] for s in spots if s.get("id")}

    to_add: list[dict] = []

    for state_name in sorted(uscf_data.keys()):
        for club in uscf_data[state_name]:
            name = club.get("name", "").strip()
            if not name or name.lower() in existing_names:
                continue

            base_id = slugify(name)
            spot_id = base_id
            n = 2
            while spot_id in existing_ids:
                spot_id = f"{base_id}_{n}"
                n += 1
            existing_ids.add(spot_id)
            existing_names.add(name.lower())

            spot: dict = {
                "id": spot_id,
                "name": name,
                "lat": None,
                "lng": None,
                "category": "club",
                "uscf_id": club.get("uscf_id"),
                "is_active_uscf": True,
                "has_weekly_club_meetings": True,
            }
            website = club.get("website")
            if website:
                spot["website"] = website

            to_add.append(spot)

    if not to_add:
        print("Nothing to import (all clubs already present).")
        return

    answer = input(f"Add {len(to_add)} clubs to {SPOTS_PATH}? [Y/n] ").strip()
    if answer.lower() not in ("", "y", "yes"):
        print("Aborted.")
        return

    spots.extend(to_add)
    SPOTS_PATH.write_text(
        json.dumps(spots, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Added {len(to_add)} clubs. Total spots: {len(spots)}")


if __name__ == "__main__":
    main()
