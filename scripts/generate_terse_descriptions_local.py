#!/usr/bin/env python3
"""
Generate terse 1-2 sentence descriptions for chess clubs from verbose notes.
Rule-based extraction - no LLM required.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def get_venue_from_address(addr: str | None) -> str:
    """Extract venue name from address when format is 'Venue, City, ST'."""
    if not addr or not isinstance(addr, str):
        return ""
    parts = [p.strip() for p in addr.split(",")]
    first = parts[0] if parts else ""
    if not first:
        return ""
    # Skip street addresses (start with number)
    if re.match(r"^\d+\s", first):
        return ""
    # Skip generic street names (Main St, etc.)
    if re.match(r"^(main\s+st\.?|main\s+street)$", first, re.I):
        return ""
    if re.match(r"^[\w\s]+(?:st\.?|street|avenue|ave\.?|road|rd\.?|blvd\.?|pkwy|drive)\s*$", first, re.I):
        return ""
    # Skip long strings that look like full addresses
    if len(first) > 50:
        return ""
    return first


def get_venue_from_name(name: str) -> str:
    """Extract venue from club name when it's 'X Cafe/Brewery Chess Club'."""
    if not name:
        return ""
    # "The Battleground Cafe Chess Club", "San Tan Brewing Chess Club"
    m = re.search(
        r"([A-Za-z][A-Za-z\s&'.-]+?(?:Cafe|Coffee|Brewing|Brewery|Library|Center|Pub|Bar|Roasteria|Academy|Meadery))\s+Chess",
        name,
        re.I,
    )
    if m:
        v = m.group(1).strip()
        v = re.sub(r"^(the|a|an)\s+", "", v, flags=re.I)
        if 3 < len(v) < 45:
            return v
    return ""


def get_venue_from_notes(notes: str, name: str) -> str:
    """Extract venue from notes using common patterns."""
    if not notes:
        return ""
    # "at Ava Roasteria (15135 SW Barrows Rd..." - venue before paren+address
    m = re.search(r"\bat\s+([A-Za-z][A-Za-z\s&'.-]+?)\s*\([^)]*\d{4,5}", notes)
    if m:
        v = m.group(1).strip()
        if "person" not in v.lower() and 3 < len(v) < 45:
            return v
    # "at Panera Bread", "at La Madeleines" - before street address
    m = re.search(r"\bat\s+([A-Za-z][A-Za-z\s&'.-]+?(?:Bread|Coffee Shop|Coffee|Cafe|Brewing|Brewery|Library|Center|Mall|Park|House|Union|Deli|Donuts|Gym|Tavern|IHOP|Roasteria))\b", notes, re.I)
    if m:
        v = m.group(1).strip()
        if "person" not in v.lower() and "chess" not in v.lower()[:8]:
            return v
    patterns = [
        r"at\s+(?:the\s+)?([A-Za-z][A-Za-z\s&'.-]+?(?:Library|Center|Cafe|Coffee Shop|Coffee|Brewing|Brewery|Pub|Bar|Mall|Church|School|Academy|Gym|Park|Restaurant|Buffet|IHOP|Panera|Union|Deli|Donuts|Roasteria))",
        r"meet[s]?\s+(?:at|in)\s+(?:the\s+)?([A-Za-z][A-Za-z\s&'.-]{3,35}?)(?:\s+every|\s+on|\s+from|\s+Wed|\s+Mon|,|\.)",
        r"(?:held|hosted?|meets?)\s+at\s+([A-Za-z][A-Za-z\s&'.-]+)",
        r"at\s+([A-Za-z][A-Za-z\s&'.-]+?(?:Senior Center|Community Center|Community House|Student Union|Food Court))",
        r"([A-Za-z][A-Za-z\s&'.-]+?(?:Library|Center|Cafe|Coffee|Brewing|Brewery|Pub|Bar|Mall))\s",
        r"(\w+(?:\s+\w+)?\s+(?:Library|Center|Cafe|Coffee|Brewing|Brewery|Pub|Bar|Mall))",
    ]
    for pat in patterns:
        m = re.search(pat, notes, re.I)
        if m:
            v = m.group(1).strip()
            v = re.sub(r"^Welcome to (?:the )?", "", v, flags=re.I)
            bad = ("chess", "person", "this is", "is a ", "a small")
            if 3 < len(v) < 45 and not any(b in v.lower() for b in bad):
                return v
    # Fallback: from club name if "X Library Chess Club"
    if "library" in name.lower():
        m = re.search(r"([A-Za-z][A-Za-z\s]+(?:Public\s+)?Library)", name, re.I)
        if m:
            return m.group(1).strip()
    # "Dupont Circle Chess Club" -> Dupont Circle
    if "dupont" in name.lower() or "circle" in name.lower():
        m = re.search(r"(Dupont\s+Circle)", name, re.I)
        if m:
            return m.group(1).strip()
    return ""


MANUAL_OVERRIDES: dict[str, str] = {
    "lincoln_mass_chess_club": "Weekly meetup at Lincoln Library. All ages, all levels.",
    "friendswood_public_library_chess_club": "Casual chess at Friendswood Public Library. All welcome.",
    "fort_collins_co_chess_club": "Casual chess at CSU Student Union and Purpose Brewing. Rated tournaments at Gryphon Games.",
    "rahway_chess_club": "USCF-rated quads at Chessmates. Competitive club.",
}


def build_description(club: dict[str, Any]) -> str:
    """Build terse 1-2 sentence description."""
    cid = club.get("id", "")
    if cid in MANUAL_OVERRIDES:
        return MANUAL_OVERRIDES[cid]
    name = club.get("name", "")
    notes = (club.get("notes") or "").strip()
    address = club.get("address") or ""
    city = club.get("city") or ""
    state = club.get("state") or ""
    loc = f"{city}, {state}".strip(", ") if (city or state) else ""

    venue = (
        get_venue_from_name(name)
        or get_venue_from_notes(notes, name)
        or get_venue_from_address(address)
    )
    n = notes.lower()

    # Vibe / who's welcome
    vibe_parts = []
    if any(x in n for x in ["all ages", "all age", "everyone welcome", "open to all", "all welcome", "all are welcome"]):
        vibe_parts.append("all ages")
    elif any(x in n for x in ["adults only", "18+", "adults only"]):
        vibe_parts.append("adults only")
    if any(x in n for x in ["all levels", "all skill", "beginner", "all abilities", "any skill", "all skill levels"]):
        vibe_parts.append("all levels")
    if any(x in n for x in ["casual", "informal", "friendly", "social"]):
        vibe_parts.append("casual")
    if any(x in n for x in ["competitive", "uscf", "rated", "tournament"]):
        vibe_parts.append("competitive")
    if any(x in n for x in ["youth", "kids", "children", "scholastic", "students", "7 to adult"]):
        vibe_parts.append("kids welcome")
    if any(x in n for x in ["boards provided", "sets provided", "chess sets", "bring your chess set"]):
        vibe_parts.append("boards provided" if "bring" not in n else "bring set")
    vibe = ", ".join(vibe_parts) if vibe_parts else "all welcome"

    # Standout (avoid redundant with venue)
    standout = ""
    if "uscf" in n or "rated" in n:
        if "tournament" in n or "tournaments" in n:
            standout = "USCF-rated tournaments"
        else:
            standout = "USCF-rated play"
    elif ("library" in n or "library" in str(address).lower()) and "library" not in venue.lower():
        standout = "library meetup"
    elif ("coffee" in n or "cafe" in n or "brew" in n or "brewery" in n) and "over the coffee" not in n:
        if "community house" not in venue.lower() and "community center" not in venue.lower():
            standout = "coffee/brewery hangout"
    elif re.search(r"\b(bar|pub|brewery)\b", n) and "public" not in n:
        standout = "bar chess"
    elif "free" in n and ("no cost" in n or "no enrollment" in n):
        standout = "free, no enrollment"
    elif "lesson" in n or "instruction" in n or "teaching" in n:
        standout = "lessons available"
    elif "minority" in n or "youth program" in n:
        standout = "community-focused"

    # Build sentence(s)
    if venue:
        lead = f"Chess at {venue}."
    elif loc:
        lead = f"Chess club in {loc}."
    else:
        lead = "Chess club."

    if vibe and vibe != "all welcome":
        lead += f" {vibe.capitalize()}."
    elif vibe == "all welcome":
        lead += " All welcome."

    if standout:
        lead += f" {standout}."

    # Clean
    lead = re.sub(r"\s+", " ", lead).strip()
    lead = re.sub(r"\.+", ".", lead)
    if len(lead) > 120:
        lead = lead[:117] + "..."
    return lead


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    clubs = json.loads(args.input.read_text(encoding="utf-8"))
    if args.limit:
        clubs = clubs[: args.limit]

    results = [{"id": c.get("id", ""), "description": build_description(c)} for c in clubs]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(results)} descriptions to {args.output}")


if __name__ == "__main__":
    main()
