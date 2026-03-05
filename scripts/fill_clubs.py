#!/usr/bin/env python3
"""Interactive tool to fill in blank club entries in spots.v1.json.

Finds the next club with missing coordinates (lat is null), shows any
context from the USCF scrape, and prompts for Google Maps link, image
extension, website, notes, and hours.

Usage:
    python3 scripts/fill_clubs.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

SPOTS_PATH = Path("public/spots.v1.json")
USCF_PATH = Path("data/uscf_clubs.json")

DAY_ABBREVS: dict[str, str] = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday",
    "thu": "Thursday", "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
    "monday": "Monday", "tuesday": "Tuesday", "wednesday": "Wednesday",
    "thursday": "Thursday", "friday": "Friday", "saturday": "Saturday",
    "sunday": "Sunday",
}


# ---------------------------------------------------------------------------
# Google Maps URL coord extraction (same logic as scripts/add-spot.mjs)
# ---------------------------------------------------------------------------

def extract_coords(url: str) -> tuple[float, float] | None:
    m = re.search(r"!2m2!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)", url)
    if m:
        return float(m.group(2)), float(m.group(1))

    m = re.search(r"!3d(-?\d+\.\d+).*?!2d(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"!2d(-?\d+\.\d+).*?!3d(-?\d+\.\d+)", url)
    if m:
        return float(m.group(2)), float(m.group(1))

    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))

    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        for key in ("ll", "q", "center", "query"):
            if key in params:
                parts = params[key][0].split(",")
                if len(parts) == 2:
                    lat, lng = float(parts[0]), float(parts[1])
                    if -90 <= lat <= 90 and -180 <= lng <= 180:
                        return lat, lng
    except (ValueError, IndexError):
        pass

    m = re.search(r"/place/(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))

    return None


# ---------------------------------------------------------------------------
# Hours parsing
# ---------------------------------------------------------------------------

def parse_hours(raw: str) -> dict | None:
    """Parse 'Tue 17:00-20:00, Thu 13:00' into the hours dict format."""
    if not raw.strip():
        return None
    hours: dict = {}
    for part in raw.split(","):
        tokens = part.strip().split()
        if not tokens:
            continue
        day_name = DAY_ABBREVS.get(tokens[0].lower().rstrip(":"))
        if not day_name:
            print(f"    Unknown day: {tokens[0]}")
            continue
        if len(tokens) >= 2 and "-" in tokens[1]:
            open_close = tokens[1].split("-", 1)
            entry: dict[str, str] = {"open": open_close[0]}
            if len(open_close) > 1 and open_close[1]:
                entry["close"] = open_close[1]
            hours[day_name] = entry
        elif len(tokens) >= 2:
            hours[day_name] = {"open": tokens[1]}
        else:
            hours[day_name] = {}
    return hours or None


# ---------------------------------------------------------------------------
# USCF context loader
# ---------------------------------------------------------------------------

def load_uscf_context() -> dict[str, dict]:
    if not USCF_PATH.exists():
        return {}
    data = json.loads(USCF_PATH.read_text(encoding="utf-8"))
    lookup: dict[str, dict] = {}
    for state, clubs in data.items():
        for club in clubs:
            name = club.get("name", "").strip().lower()
            if name:
                lookup[name] = {**club, "_state": state}
    return lookup


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def save(spots: list[dict]) -> None:
    SPOTS_PATH.write_text(
        json.dumps(spots, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def ask(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        val = input(f"  {label}{suffix}: ").strip()
    except EOFError:
        val = ""
    return val or default


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not SPOTS_PATH.exists():
        print(f"Not found: {SPOTS_PATH}", file=sys.stderr)
        sys.exit(1)

    spots: list[dict] = json.loads(SPOTS_PATH.read_text(encoding="utf-8"))
    uscf = load_uscf_context()

    blanks = [(i, s) for i, s in enumerate(spots) if s.get("lat") is None]
    total = len(blanks)
    if not total:
        print("All clubs have coordinates — nothing to fill!")
        return

    print(f"\n  {len(spots)} spots total, {total} need filling.\n")

    for seq, (idx, spot) in enumerate(blanks):
        name = spot.get("name", "(unnamed)")
        sid = spot.get("id", "")
        remaining = total - seq

        # ── Show club info ──────────────────────────────────────
        print(f"{'─' * 50}")
        print(f"  [{seq + 1}/{total}]  {name}")
        print(f"  id: {sid}")

        ctx = uscf.get(name.lower())
        if ctx:
            city = ctx.get("city", "")
            state = ctx.get("_state", "")
            if city:
                print(f"  City: {city}, {state}")
            elif state:
                print(f"  State: {state}")
            if ctx.get("address"):
                print(f"  Address: {ctx['address']}")
            if ctx.get("email"):
                print(f"  Email: {ctx['email']}")
            if ctx.get("phone"):
                print(f"  Phone: {ctx['phone']}")
        if spot.get("website"):
            current_websites = spot["website"]
            if isinstance(current_websites, list):
                print(f"  Website: {', '.join(current_websites)}")
            else:
                print(f"  Website: {current_websites}")
        print()

        # ── Action ──────────────────────────────────────────────
        cmd = ask("(enter) fill  |  (s)kip  |  (q)uit", "fill").lower()
        if cmd in ("q", "quit"):
            print("\n  Bye!\n")
            return
        if cmd in ("s", "skip"):
            continue

        # ── Google Maps link → coords ──────────────────────────
        lat = lng = None
        while lat is None:
            gmap_url = ask("Google Maps link (blank for manual lat/lng)")
            if gmap_url:
                coords = extract_coords(gmap_url)
                if coords:
                    lat, lng = coords
                    spot["gmap"] = gmap_url
                    print(f"    → lat={lat}, lng={lng}")
                else:
                    print("    Could not extract coords from URL.")
                    keep = ask("Save URL anyway? (y/n)", "y")
                    if keep.lower() == "y":
                        spot["gmap"] = gmap_url
                    raw_lat = ask("Lat")
                    raw_lng = ask("Lng")
                    try:
                        lat, lng = float(raw_lat), float(raw_lng)
                    except ValueError:
                        print("    Invalid coords, try again.")
            else:
                raw_lat = ask("Lat")
                raw_lng = ask("Lng")
                try:
                    lat, lng = float(raw_lat), float(raw_lng)
                except ValueError:
                    print("    Invalid coords, try again.")

        spot["lat"] = lat
        spot["lng"] = lng

        # ── Image ──────────────────────────────────────────────
        ext = ask("Image extension (png/jpg/webp/avif, blank to skip)")
        if ext:
            ext = ext.lstrip(".")
            photo = f"/img/{sid}.{ext}"
            spot["photo"] = photo
            print(f"    → Save image as: {sid}.{ext}")

        # ── Website(s) ─────────────────────────────────────────
        websites: list[str] = []
        existing_website = spot.get("website")
        if isinstance(existing_website, str) and existing_website.strip():
            websites.append(existing_website.strip())
        elif isinstance(existing_website, list):
            websites.extend(
                [u.strip() for u in existing_website if isinstance(u, str) and u.strip()]
            )

        if not websites:
            url = ask("Website (blank to skip)")
            if url and url not in websites:
                websites.append(url)

        alt_url = ask("Alternate URL (blank to skip)")
        if alt_url and alt_url not in websites:
            websites.append(alt_url)

        if websites:
            spot["website"] = websites[0] if len(websites) == 1 else websites

        # ── Notes ──────────────────────────────────────────────
        notes = ask("Notes (blank to skip)")
        if notes:
            spot["notes"] = notes

        # ── Hours ──────────────────────────────────────────────
        hrs_raw = ask("Hours (e.g. Tue 17:00-20:00, Thu 13:00, blank to skip)")
        if hrs_raw:
            parsed = parse_hours(hrs_raw)
            if parsed:
                spot["hours"] = parsed

        # ── Rename ─────────────────────────────────────────────
        new_name = ask(f"Rename (blank to keep '{name}')")
        if new_name:
            spot["name"] = new_name

        # ── Save ───────────────────────────────────────────────
        save(spots)
        print(f"    Saved! ({remaining - 1} remaining)\n")

    print("\n  All done!\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n  Interrupted — progress already saved.\n")
