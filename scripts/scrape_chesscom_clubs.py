#!/usr/bin/env python3
"""
Scrape US Chess.com club data.

Step 1: Download all US club slugs via the callback API (paginated).
Step 2: Fetch full profiles for each club via the public API.

Output:
    data/chesscom_club_slugs.json   (step 1 cache / checkpoint)
    data/chesscom_clubs.json        (step 2 full profiles)

Usage:
    python scripts/scrape_chesscom_clubs.py
    python scripts/scrape_chesscom_clubs.py --skip-download
    python scripts/scrape_chesscom_clubs.py --resume
    python scripts/scrape_chesscom_clubs.py --limit 100
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from html import unescape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CALLBACK_URL = "https://www.chess.com/callback/club/search"
CLUB_API_URL = "https://api.chess.com/pub/club"
US_COUNTRY_CODE = 2
PAGE_SIZE = 25

DATA_DIR = Path("data")
SLUGS_CACHE = DATA_DIR / "chesscom_club_slugs.json"
CLUBS_OUTPUT = DATA_DIR / "chesscom_clubs.json"

HEADERS = {"User-Agent": "chess-hotspot-bot/1.0 (club scraper)"}


def _fetch_json(url: str, timeout: int = 30) -> dict:
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def _clean_html(text: str) -> str:
    text = unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&\w+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ── Step 1: Download all US club slugs ───────────────────────────────────────

def download_club_slugs(delay: float = 0.5, checkpoint_every: int = 10) -> list[dict]:
    """Page through the callback API to collect all US club basic info."""
    print("Step 1: Downloading US club list from callback API...")
    all_clubs: list[dict] = []
    page = 1
    seen_ids: set[int] = set()
    empty_streak = 0
    rate_limit_count = 0
    pages_since_checkpoint = 0

    if SLUGS_CACHE.exists():
        try:
            cached = json.loads(SLUGS_CACHE.read_text(encoding="utf-8"))
            if isinstance(cached, list) and cached:
                all_clubs = cached
                for c in all_clubs:
                    cid = c.get("id")
                    if isinstance(cid, int):
                        seen_ids.add(cid)
                page = max(1, (len(all_clubs) // PAGE_SIZE) + 1)
                print(
                    f"  Resuming from cache: {len(all_clubs)} clubs loaded. "
                    f"Restarting at page {page}."
                )
        except json.JSONDecodeError:
            print("  Warning: slug cache is invalid JSON, starting from page 1.")

    while True:
        url = f"{CALLBACK_URL}?sort=2&country={US_COUNTRY_CODE}&page={page}"
        try:
            data = _fetch_json(url)
            rate_limit_count = 0
        except HTTPError as e:
            if e.code == 429:
                rate_limit_count += 1
                wait = min(10 * rate_limit_count, 60)
                print(f"  Rate limited on page {page}, waiting {wait}s... (attempt {rate_limit_count})")
                time.sleep(wait)
                continue
            print(f"  HTTP {e.code} on page {page}, stopping.")
            break
        except (URLError, TimeoutError) as e:
            print(f"  Network error on page {page}: {e}, retrying...")
            time.sleep(5)
            continue

        clubs = data.get("clubs", [])
        if not clubs:
            empty_streak += 1
            if empty_streak >= 3:
                break
            page += 1
            continue

        empty_streak = 0
        new_count = 0
        for c in clubs:
            cid = c.get("id")
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                all_clubs.append({
                    "id": cid,
                    "slug": c.get("url", ""),
                    "name": c.get("name", ""),
                    "member_count": c.get("member_count", 0),
                    "description_preview": _clean_html(c.get("description", "")),
                })
                new_count += 1

        if page % 50 == 0:
            print(f"  Page {page}: {len(all_clubs)} clubs so far (+{new_count} new)")
        pages_since_checkpoint += 1
        if pages_since_checkpoint >= checkpoint_every:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            SLUGS_CACHE.write_text(
                json.dumps(all_clubs, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            print(f"  Checkpoint saved: {len(all_clubs)} clubs (page {page})")
            pages_since_checkpoint = 0

        page += 1
        time.sleep(delay)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SLUGS_CACHE.write_text(
        json.dumps(all_clubs, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"  Done. {len(all_clubs)} unique US clubs saved to {SLUGS_CACHE}")
    return all_clubs


# ── Step 2: Fetch full club profiles ─────────────────────────────────────────

def fetch_club_profile(slug: str, max_retries: int = 3) -> dict | None:
    url = f"{CLUB_API_URL}/{slug}"
    for attempt in range(max_retries):
        try:
            data = _fetch_json(url)
            return {
                "slug": slug,
                "name": data.get("name", ""),
                "club_id": data.get("club_id"),
                "location": data.get("location", ""),
                "description": _clean_html(data.get("description", "")),
                "members_count": data.get("members_count", 0),
                "url": data.get("url", f"https://www.chess.com/club/{slug}"),
                "country": data.get("country", "").split("/")[-1],
                "visibility": data.get("visibility", ""),
                "created": data.get("created"),
            }
        except HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:
                wait = 5 * (attempt + 1)
                print(f"    429 on {slug}, waiting {wait}s...")
                time.sleep(wait)
                continue
            if e.code >= 500:
                time.sleep(2)
                continue
            return None
        except (URLError, TimeoutError):
            time.sleep(2)
            continue
    return None


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape Chess.com US clubs")
    parser.add_argument("--skip-download", action="store_true",
                        help="Skip step 1, reuse cached club slug list")
    parser.add_argument("--resume", action="store_true",
                        help="Resume step 2 from where we left off")
    parser.add_argument("--limit", type=int, default=0,
                        help="Only fetch first N club profiles (0 = all)")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1
    if args.skip_download:
        if not SLUGS_CACHE.exists():
            print("No cached club list found. Run without --skip-download first.")
            sys.exit(1)
        clubs = json.loads(SLUGS_CACHE.read_text(encoding="utf-8"))
        print(f"Step 1: Loaded {len(clubs)} cached club slugs.")
    else:
        clubs = download_club_slugs()

    if not clubs:
        print("No clubs found.")
        sys.exit(1)

    # Step 2
    profiles: list[dict] = []
    existing_slugs: set[str] = set()

    if args.resume and CLUBS_OUTPUT.exists():
        profiles = json.loads(CLUBS_OUTPUT.read_text(encoding="utf-8"))
        existing_slugs = {p["slug"] for p in profiles}
        print(f"Step 2: Resuming with {len(profiles)} existing profiles.")

    slugs_to_fetch = [c["slug"] for c in clubs if c["slug"] not in existing_slugs]
    if args.limit:
        slugs_to_fetch = slugs_to_fetch[:args.limit]

    total = len(slugs_to_fetch)
    if total == 0:
        print(f"Step 2: All {len(profiles)} profiles already fetched.")
    else:
        print(f"Step 2: Fetching {total} club profiles...")
        fetched = 0
        failed = 0

        for i, slug in enumerate(slugs_to_fetch):
            profile = fetch_club_profile(slug)
            if profile:
                profiles.append(profile)
                fetched += 1
            else:
                failed += 1

            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{total}: {fetched} fetched, {failed} failed")
                CLUBS_OUTPUT.write_text(
                    json.dumps(profiles, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )

        print(f"  Done. {fetched} profiles fetched, {failed} failed.")

    CLUBS_OUTPUT.write_text(
        json.dumps(profiles, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Saved {len(profiles)} club profiles to {CLUBS_OUTPUT}")


if __name__ == "__main__":
    main()
