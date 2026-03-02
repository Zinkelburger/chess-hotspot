#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

from events_scrapers import CCAScraper, BaseEventScraper, ScrapedEvent


def run_scrapers(scrapers: Iterable[BaseEventScraper]) -> list[ScrapedEvent]:
    events: list[ScrapedEvent] = []
    for scraper in scrapers:
        print(f"\n[{scraper.source_id}] {scraper.words_at_top}")
        scraped = scraper.scrape()
        print(f"[{scraper.source_id}] collected {len(scraped)} events")
        events.extend(scraped)
    return events


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape chess event sources into JSON.")
    parser.add_argument(
        "--output",
        default="public/events.v1.json",
        help="Output JSON path (default: public/events.v1.json)",
    )
    args = parser.parse_args()

    scrapers: list[BaseEventScraper] = [CCAScraper()]
    events = run_scrapers(scrapers)

    payload = [e.to_dict() for e in events]

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {len(events)} events -> {out_path}")


if __name__ == "__main__":
    main()
