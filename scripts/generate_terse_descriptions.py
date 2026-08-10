#!/usr/bin/env python3
"""
Generate terse 1-2 sentence descriptions for chess clubs from verbose notes.

Reads clubs from input JSON, sends each to an LLM for description generation,
and writes results to output JSON.

Required env:
  OPENAI_API_KEY

Usage:
  python scripts/generate_terse_descriptions.py /tmp/desc_batch_3.json /tmp/desc_results_3.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

SYSTEM_PROMPT = """You write extremely terse 1-2 sentence descriptions for chess clubs.

Focus ONLY on:
- Where they meet (venue name, NOT full address - address is stored separately)
- Their vibe/who's welcome (e.g., "all ages", "adults only", "casual", "competitive")
- Any standout detail

Examples of good terse descriptions:
- "Casual chess at Wackadoo Brewing. All ages, all levels."
- "Weekly meetup at the public library. Boards provided."
- "Competitive USCF-rated club. Tournaments most Saturdays."
- "Coffee shop chess hangout. Kids and adults welcome."
- "Casual OTB play at a bar. Friendly group, all skill levels."

Do NOT include:
- Meeting times (stored in hours field)
- Full addresses (stored in address field)
- Long histories or founder stories
- Chess.com recruitment language
- URLs

Return ONLY a valid JSON object with exactly two keys:
{"id": "club_id", "description": "terse description"}

Keep descriptions under 100 characters when possible. Be concise."""


def extract_venue_from_address(addr: str | None) -> str:
    """Extract venue name from address when it looks like 'Venue Name, City, ST'."""
    if not addr or not isinstance(addr, str):
        return ""
    # Common pattern: "Venue Name, City, ST" or "Venue Name, City"
    parts = [p.strip() for p in addr.split(",")]
    if len(parts) >= 1 and parts[0] and not parts[0][0].isdigit():
        return parts[0]
    return ""


def llm_describe(club: dict[str, Any], api_key: str, max_retries: int = 4) -> dict[str, Any]:
    club_id = club.get("id", "")
    name = club.get("name", "")
    notes = club.get("notes", "")
    address = club.get("address", "") or ""
    city = club.get("city") or ""
    state = club.get("state") or ""

    venue_hint = extract_venue_from_address(address)

    user_content = json.dumps(
        {
            "id": club_id,
            "name": name,
            "notes": notes[:2000],  # truncate very long notes
            "address_venue_hint": venue_hint if venue_hint else "(use notes/name to infer)",
            "city": city,
            "state": state,
        },
        ensure_ascii=False,
    )

    payload = {
        "model": MODEL,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }

    body = json.dumps(payload).encode("utf-8")
    req = Request(
        OPENAI_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    for attempt in range(1, max_retries + 1):
        try:
            with urlopen(req, timeout=60) as res:
                data = json.loads(res.read())
            content = data["choices"][0]["message"]["content"].strip()
            # Parse JSON from response (handle markdown code blocks)
            if "```" in content:
                start = content.find("{")
                end = content.rfind("}") + 1
                if start != -1 and end > start:
                    content = content[start:end]
            parsed = json.loads(content)
            if "id" not in parsed:
                parsed["id"] = club_id
            if "description" not in parsed:
                raise ValueError("Missing description in response")
            return {"id": str(parsed["id"]), "description": str(parsed["description"])}
        except HTTPError as e:
            if e.code in {429, 500, 502, 503, 504} and attempt < max_retries:
                wait = min(2**attempt, 20)
                time.sleep(wait)
                continue
            raise
        except (URLError, TimeoutError, json.JSONDecodeError, ValueError):
            if attempt < max_retries:
                time.sleep(2 * attempt)
                continue
            raise

    raise RuntimeError("Unreachable")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate terse descriptions for chess clubs")
    parser.add_argument("input", type=Path, help="Input JSON with clubs")
    parser.add_argument("output", type=Path, help="Output JSON path")
    parser.add_argument("--limit", type=int, default=0, help="Process only first N clubs")
    parser.add_argument("--sleep-ms", type=int, default=200, help="Delay between LLM calls")
    args = parser.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Missing OPENAI_API_KEY env var.")
        sys.exit(1)

    if not args.input.exists():
        print(f"Input file not found: {args.input}")
        sys.exit(1)

    clubs = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(clubs, list):
        print("Input must be a JSON array of clubs.")
        sys.exit(1)

    if args.limit:
        clubs = clubs[: args.limit]

    results: list[dict[str, str]] = []
    total = len(clubs)

    for i, club in enumerate(clubs):
        club_id = club.get("id", "")
        try:
            result = llm_describe(club, api_key=api_key)
            results.append(result)
            print(f"[{i + 1}/{total}] {club_id}: {result['description'][:60]}...")
        except Exception as e:
            print(f"[{i + 1}/{total}] {club_id}: ERROR - {e}")
            results.append({"id": club_id, "description": f"(Error: {e})"})

        if args.sleep_ms > 0 and i < total - 1:
            time.sleep(args.sleep_ms / 1000.0)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {len(results)} descriptions to {args.output}")


if __name__ == "__main__":
    main()
