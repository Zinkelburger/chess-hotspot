#!/usr/bin/env python3
"""
Manual-rules postprocessing for Chess.com clubs.

No external LLM/API calls. Processes every club entry from:
  data/chesscom_clubs.json

Outputs:
  data/chesscom_postprocessed.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path

DATA_DIR = Path("data")
INPUT_PATH = DATA_DIR / "chesscom_clubs.json"
OUTPUT_PATH = DATA_DIR / "chesscom_postprocessed.json"

US_STATE_ABBREVS = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "DC",
}
US_STATE_NAMES = {
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
    "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
    "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "new york", "north carolina", "north dakota", "ohio",
    "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
    "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
    "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
}

SCHOOL_EXCLUDE = re.compile(
    r"\b("
    r"high school|middle school|junior high|elementary school|"
    r"\bhs\b|\bms\b|k[\- ]?12|prep school"
    r")\b",
    re.IGNORECASE,
)
COLLEGE_KEEP = re.compile(
    r"\b("
    r"college|university|campus|undergraduate|graduate student|"
    r"student chess club"
    r")\b",
    re.IGNORECASE,
)
MEME_OR_FANDOM_EXCLUDE = re.compile(
    r"\b("
    r"fan club|fandom|stan club|giveaway|roblox|tiktok|brainrot|"
    r"meme|shitpost|joke club|waifu|anime only|pokemon|minecraft|"
    r"sigma|skibidi|discord only|youtube fan|stream fan|"
    r"chesskid|chesskid vs chess\.com|roleplay|rp clan"
    r")\b",
    re.IGNORECASE,
)
ONLINE_ONLY_EXCLUDE = re.compile(
    r"\b("
    r"online only|online club|internet only|virtual only|"
    r"everywhere|worldwide|global|chess\.com|discord|telegram|"
    r"no in person|remote only|metaverse|your mom'?s house|backyard"
    r")\b",
    re.IGNORECASE,
)
REAL_VENUE_HINT = re.compile(
    r"\b("
    r"library|park|community center|recreation center|rec center|"
    r"coffee shop|cafe|restaurant|pub|barnes & noble|bookstore|"
    r"church|museum|city hall|clubhouse|address|avenue|street|road|"
    r"boulevard|drive|lane|suite|building|downtown|meet every|"
    r"meets every|in person|in-person"
    r")\b",
    re.IGNORECASE,
)
CITY_STATE_PATTERN = re.compile(r"\b[A-Za-z .'-]+,\s*[A-Z]{2}\b")


def has_real_place_signal(name: str, location: str, description: str) -> bool:
    combined = f"{name} {location} {description}"
    combined_l = combined.lower()

    if CITY_STATE_PATTERN.search(combined):
        return True

    for state in US_STATE_NAMES:
        if state in combined_l:
            return True

    for abbr in US_STATE_ABBREVS:
        if re.search(rf"\b{abbr}\b", combined):
            return True

    if REAL_VENUE_HINT.search(combined):
        return True

    return False


def classify(profile: dict) -> tuple[bool, str]:
    members = int(profile.get("members_count", 0) or 0)
    name = str(profile.get("name", "") or "")
    slug = str(profile.get("slug", "") or "")
    location = str(profile.get("location", "") or "")
    description = str(profile.get("description", "") or "")
    combined = f"{name} {slug} {location} {description}"

    if members <= 1:
        return False, "exclude: member_count <= 1"

    if SCHOOL_EXCLUDE.search(combined):
        # Explicitly keep college/university clubs.
        if not COLLEGE_KEEP.search(combined):
            return False, "exclude: school club (non-college)"

    if MEME_OR_FANDOM_EXCLUDE.search(combined):
        return False, "exclude: meme/fandom/giveaway/online culture signals"

    if ONLINE_ONLY_EXCLUDE.search(location) or ONLINE_ONLY_EXCLUDE.search(combined):
        # Some real clubs mention online play; require stronger real-world signals.
        if not has_real_place_signal(name, location, description):
            return False, "exclude: online-only or no credible in-person signal"

    if not has_real_place_signal(name, location, description):
        return False, "exclude: no credible real-world place signal"

    return True, "keep: real-world club signals"


def main() -> None:
    profiles = json.loads(INPUT_PATH.read_text(encoding="utf-8"))

    kept: list[dict] = []
    total = 0
    excluded = 0

    for profile in profiles:
        total += 1
        keep, reason = classify(profile)
        if not keep:
            excluded += 1
            continue

        kept.append(
            {
                "name": profile.get("name", ""),
                "slug": profile.get("slug", ""),
                "url": profile.get("url", ""),
                "location": profile.get("location", ""),
                "members_count": int(profile.get("members_count", 0) or 0),
                "description": profile.get("description", ""),
                "created": profile.get("created"),
                "classification": "real_club",
                "classification_reason": reason,
            }
        )

    kept.sort(key=lambda x: x.get("members_count", 0), reverse=True)
    OUTPUT_PATH.write_text(json.dumps(kept, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Processed: {total}")
    print(f"Kept: {len(kept)}")
    print(f"Excluded: {excluded}")
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

