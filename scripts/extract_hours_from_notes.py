#!/usr/bin/env python3
"""
Extract structured hours from chess.com club notes using regex parsing.

Reads public/spots.v1.json, finds chess.com clubs with empty hours whose
notes contain day/time references, parses out structured hours, and writes
back to the spots file.

Usage:
  python scripts/extract_hours_from_notes.py
  python scripts/extract_hours_from_notes.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

SPOTS_PATH = Path("public/spots.v1.json")

DAY_NAMES_ORDERED = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_NAMES_SET = set(DAY_NAMES_ORDERED)

DAY_MAP: dict[str, str] = {}
for _d in DAY_NAMES_ORDERED:
    DAY_MAP[_d.lower()] = _d
    DAY_MAP[_d[:3].lower()] = _d
    DAY_MAP[_d.lower() + "s"] = _d
    DAY_MAP[_d[:3].lower() + "s"] = _d

DAY_MAP["thurs"] = "Thursday"
DAY_MAP["thur"] = "Thursday"
DAY_MAP["tues"] = "Tuesday"
DAY_MAP["weds"] = "Wednesday"

DAY_PATTERN = (
    r"\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?"
    r"|mon|tues?|weds?|thu(?:rs?)?|fri|sat|sun)\b"
)

AMPM_RE = re.compile(r"(a\.?m\.?|p\.?m\.?)", re.IGNORECASE)


def normalize_ampm(s: str) -> str:
    return s.replace(".", "").lower()


def parse_time_raw(text: str) -> tuple[int, int, str | None]:
    """Parse time text into (hour, minute, ampm_or_None)."""
    text = text.strip().lower()
    if text == "noon":
        return (12, 0, "pm")
    if text == "midnight":
        return (0, 0, "am")

    ampm_m = AMPM_RE.search(text)
    ampm = normalize_ampm(ampm_m.group(1)) if ampm_m else None
    digits = AMPM_RE.sub("", text).strip()

    m = re.match(r"(\d{1,2})(?::(\d{2}))?$", digits)
    if not m:
        return (-1, -1, None)

    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    return (hour, minute, ampm)


def to_24h(hour: int, minute: int, ampm: str | None) -> str | None:
    """Convert to HH:MM 24-hour format. Returns None for invalid times."""
    if ampm == "pm" and hour != 12:
        hour += 12
    elif ampm == "am" and hour == 12:
        hour = 0
    elif ampm is None:
        if 1 <= hour <= 8:
            hour += 12
    if hour > 23 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"


def parse_time_range(open_raw: str, close_raw: str | None) -> tuple[str | None, str | None]:
    """Parse an open and optional close time, propagating AM/PM between them."""
    oh, om, oap = parse_time_raw(open_raw)
    if oh < 0 or oh > 23 or om > 59:
        return (None, None)

    if close_raw is None or close_raw.strip().lower() in ("close", ""):
        open_time = to_24h(oh, om, oap)
        return (open_time, None)

    ch, cm, cap = parse_time_raw(close_raw)
    if ch < 0 or ch > 23 or cm > 59:
        open_time = to_24h(oh, om, oap)
        return (open_time, None)

    if cap and not oap:
        oap = cap
        trial_open = to_24h(oh, om, oap)
        trial_close = to_24h(ch, cm, cap)
        if trial_open and trial_close:
            ov = int(trial_open.replace(":", ""))
            cv = int(trial_close.replace(":", ""))
            if ov > cv and oap == "pm" and oh != 12:
                oap = "am"

    if oap and not cap:
        cap = oap
        trial_open = to_24h(oh, om, oap)
        trial_close = to_24h(ch, cm, cap)
        if trial_open and trial_close:
            ov = int(trial_open.replace(":", ""))
            cv = int(trial_close.replace(":", ""))
            if cv < ov and cap == "am" and ch != 12:
                cap = "pm"

    if not oap and not cap:
        oap = "pm" if 1 <= oh <= 8 else None
        cap = "pm" if 1 <= ch <= 8 else None

    open_time = to_24h(oh, om, oap)
    close_time = to_24h(ch, cm, cap)
    if not open_time:
        return (None, None)

    if not close_time:
        return (open_time, None)

    ov = int(open_time.replace(":", ""))
    cv = int(close_time.replace(":", ""))
    if cv < ov and cv != 0:
        if ch <= 12 and not cap:
            ch_adjusted = ch + 12
            if ch_adjusted <= 23:
                close_time = f"{ch_adjusted:02d}:{cm:02d}"

    return (open_time, close_time)


def resolve_day(text: str) -> str | None:
    return DAY_MAP.get(text.strip().lower().rstrip(".,;:"))


def expand_day_range(start: str, end: str) -> list[str]:
    s = resolve_day(start)
    e = resolve_day(end)
    if not s or not e:
        return []
    si = DAY_NAMES_ORDERED.index(s)
    ei = DAY_NAMES_ORDERED.index(e)
    if ei >= si:
        return DAY_NAMES_ORDERED[si : ei + 1]
    return DAY_NAMES_ORDERED[si:] + DAY_NAMES_ORDERED[: ei + 1]


def extract_days(text: str) -> list[str]:
    range_pat = re.compile(
        rf"({DAY_PATTERN})\s*(?:through|thru|to|-|–|—)\s*({DAY_PATTERN})",
        re.IGNORECASE,
    )
    rm = range_pat.search(text)
    if rm:
        return expand_day_range(rm.group(1), rm.group(2))

    day_re = re.compile(DAY_PATTERN, re.IGNORECASE)
    days = []
    for m in day_re.finditer(text):
        d = resolve_day(m.group(0))
        if d and d not in days:
            days.append(d)
    return days


TIME_EXPR = (
    r"(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|noon|midnight)"
)

TIME_RANGE_EXPR = (
    TIME_EXPR
    + r"\s*(?:to|-|–|—|until|til|till)\s*"
    + r"(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|noon|midnight|close)"
)

DAY_TIME_PATTERN = re.compile(
    rf"({DAY_PATTERN}(?:\s*(?:,|&|and|/|or)\s*{DAY_PATTERN})*)"
    r"(?:\s+(?:night|evening|afternoon|morning))?"
    r"\s*(?:from|at|@|,|:)?\s*"
    + TIME_RANGE_EXPR,
    re.IGNORECASE,
)

DAY_TIME_SIMPLE = re.compile(
    rf"({DAY_PATTERN}(?:\s*(?:,|&|and|/|or)\s*{DAY_PATTERN})*)"
    r"(?:\s+(?:night|evening|afternoon|morning))?"
    r"\s*(?:from|at|@|,|:)?\s*"
    + TIME_EXPR
    + r"(?!\s*(?:to|-|–|—|until|til|till))",
    re.IGNORECASE,
)

DAILY_PATTERN = re.compile(
    r"(?:every\s+day|daily|7\s+days\s+a\s+week)\s*(?:from|at|@|,)?\s*"
    + TIME_RANGE_EXPR,
    re.IGNORECASE,
)


def extract_hours_from_notes(notes: str) -> dict[str, dict[str, str]]:
    if not notes:
        return {}

    hours: dict[str, dict[str, str]] = {}

    dm = DAILY_PATTERN.search(notes)
    if dm:
        open_t, close_t = parse_time_range(dm.group(1), dm.group(2))
        if open_t:
            for day in DAY_NAMES_ORDERED:
                entry: dict[str, str] = {"open": open_t}
                if close_t:
                    entry["close"] = close_t
                hours[day] = entry
            return hours

    sentences = re.split(r"(?<=[.!?])\s+|\n+", notes)

    for sentence in sentences:
        for m in DAY_TIME_PATTERN.finditer(sentence):
            day_group = m.group(1)
            open_raw = m.group(2)
            close_raw = m.group(3)

            days = extract_days(day_group)
            if not days:
                continue

            open_t, close_t = parse_time_range(open_raw, close_raw)
            if not open_t:
                continue

            for d in days:
                entry = {"open": open_t}
                if close_t:
                    entry["close"] = close_t
                hours[d] = entry

        for m in DAY_TIME_SIMPLE.finditer(sentence):
            day_group = m.group(1)
            time_raw = m.group(2)

            days = extract_days(day_group)
            if not days:
                continue

            open_t, _ = parse_time_range(time_raw, None)
            if not open_t:
                continue

            for d in days:
                if d not in hours:
                    hours[d] = {"open": open_t}

    if hours:
        return hours

    for sentence in sentences:
        day_re = re.compile(DAY_PATTERN, re.IGNORECASE)
        day_matches = list(day_re.finditer(sentence))
        if not day_matches:
            continue

        time_range_re = re.compile(TIME_RANGE_EXPR, re.IGNORECASE)
        time_ranges = list(time_range_re.finditer(sentence))

        days = []
        for dm in day_matches:
            d = resolve_day(dm.group(0))
            if d and d not in days:
                days.append(d)

        if not days:
            continue

        if time_ranges:
            tr = time_ranges[0]
            open_t, close_t = parse_time_range(tr.group(1), tr.group(2))
            if open_t:
                for d in days:
                    entry = {"open": open_t}
                    if close_t:
                        entry["close"] = close_t
                    hours[d] = entry

    return hours


def load_spots() -> list[dict[str, Any]]:
    if not SPOTS_PATH.exists():
        print(f"Missing: {SPOTS_PATH}", file=sys.stderr)
        sys.exit(1)
    return json.loads(SPOTS_PATH.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract hours from chess.com club notes")
    parser.add_argument("--dry-run", action="store_true", help="Don't write back to spots file")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show all extractions")
    args = parser.parse_args()

    spots = load_spots()

    candidates = []
    for i, spot in enumerate(spots):
        if spot.get("source") != "chesscom_club":
            continue
        existing = spot.get("hours", {})
        if existing and any(existing.values()):
            continue
        candidates.append((i, spot))

    total = len(candidates)
    extracted = 0
    empty = 0

    print(f"Found {total} chess.com clubs with empty hours")

    for idx, spot in candidates:
        club_id = spot["id"]
        name = spot["name"]
        notes = spot.get("notes", "")

        parsed = extract_hours_from_notes(notes)

        if parsed:
            spot["hours"] = parsed
            extracted += 1
            if args.verbose:
                print(f"  + {name}: {json.dumps(parsed)}")
        else:
            empty += 1

    print(f"\nExtracted hours for {extracted} clubs")
    print(f"No hours found for {empty} clubs")

    if args.dry_run:
        print("Dry run — not writing to spots file.")
        return

    SPOTS_PATH.write_text(
        json.dumps(spots, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {SPOTS_PATH}")


if __name__ == "__main__":
    main()
