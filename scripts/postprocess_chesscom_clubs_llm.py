#!/usr/bin/env python3
"""
LLM-driven post-processing for Chess.com clubs.

Reads data/chesscom_clubs.json and asks an LLM to decide keep/exclude per club.
Decisions are checkpointed so the run can resume safely.

Required env:
  OPENAI_API_KEY

Optional env:
  OPENAI_MODEL (default: gpt-4.1-mini)

Usage:
  python scripts/postprocess_chesscom_clubs_llm.py
  python scripts/postprocess_chesscom_clubs_llm.py --limit 100
  python scripts/postprocess_chesscom_clubs_llm.py --resume
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

DATA_DIR = Path("data")
INPUT_PATH = DATA_DIR / "chesscom_clubs.json"
DECISIONS_PATH = DATA_DIR / "chesscom_postprocessed_llm_decisions.ndjson"
OUTPUT_PATH = DATA_DIR / "chesscom_postprocessed_llm.json"

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


SYSTEM_PROMPT = """You classify Chess.com clubs as KEEP or EXCLUDE.

KEEP when likely a real-world, non-meme club that could be relevant to finding real games/events.
EXCLUDE when likely joke/meme/fandom/online-only/no clear real-world club.

Rules:
- EXCLUDE if members_count <= 1
- EXCLUDE middle/high/elementary school clubs
- KEEP college/university clubs (often open to public)
- EXCLUDE fan clubs, giveaway clubs, influencer/fandom clubs, pure online communities
- If uncertain, prefer EXCLUDE (high precision over recall)

Return strict JSON with keys:
decision: "keep" or "exclude"
confidence: "high" | "medium" | "low"
category: one of "real_world", "school", "meme_fandom", "online_only", "unclear"
reason: short sentence
"""


def load_json_array(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        print(f"Missing input file: {path}")
        sys.exit(1)
    return json.loads(path.read_text(encoding="utf-8"))


def load_done_ids(path: Path) -> set[int]:
    if not path.exists():
        return set()
    done: set[int] = set()
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            idx = rec.get("index")
            if isinstance(idx, int):
                done.add(idx)
    return done


def parse_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        first_nl = text.find("\n")
        if first_nl != -1:
            text = text[first_nl + 1 :]
        text = text.replace("```", "").strip()
    return json.loads(text)


def llm_decide(club: dict[str, Any], api_key: str, max_retries: int = 4) -> dict[str, Any]:
    payload = {
        "model": MODEL,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "name": club.get("name", ""),
                        "slug": club.get("slug", ""),
                        "location": club.get("location", ""),
                        "members_count": club.get("members_count", 0),
                        "description": club.get("description", ""),
                        "url": club.get("url", ""),
                    },
                    ensure_ascii=False,
                ),
            },
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
            content = data["choices"][0]["message"]["content"]
            parsed = parse_json_object(content)
            decision = parsed.get("decision")
            if decision not in {"keep", "exclude"}:
                raise ValueError(f"Invalid decision: {decision!r}")
            return parsed
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
    parser = argparse.ArgumentParser(description="LLM postprocess Chess.com clubs")
    parser.add_argument("--limit", type=int, default=0, help="Process only first N entries")
    parser.add_argument("--resume", action="store_true", help="Resume from decisions NDJSON")
    parser.add_argument("--sleep-ms", type=int, default=150, help="Delay between LLM calls")
    args = parser.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Missing OPENAI_API_KEY env var.")
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    clubs = load_json_array(INPUT_PATH)
    if args.limit:
        clubs = clubs[: args.limit]

    done_ids = load_done_ids(DECISIONS_PATH) if args.resume else set()

    keep_count = 0
    exclude_count = 0
    processed = 0

    with DECISIONS_PATH.open("a", encoding="utf-8") as out:
        for i, club in enumerate(clubs):
            if args.resume and i in done_ids:
                continue

            result = llm_decide(club, api_key=api_key)
            decision = result.get("decision")
            if decision == "keep":
                keep_count += 1
            else:
                exclude_count += 1
            processed += 1

            record = {
                "index": i,
                "slug": club.get("slug", ""),
                "decision": decision,
                "confidence": result.get("confidence", ""),
                "category": result.get("category", ""),
                "reason": result.get("reason", ""),
            }
            out.write(json.dumps(record, ensure_ascii=False) + "\n")
            out.flush()

            if processed % 50 == 0:
                print(f"Processed {processed} | keep={keep_count} exclude={exclude_count}")

            if args.sleep_ms > 0:
                time.sleep(args.sleep_ms / 1000.0)

    decisions_by_idx: dict[int, dict[str, Any]] = {}
    with DECISIONS_PATH.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            idx = rec.get("index")
            if isinstance(idx, int):
                decisions_by_idx[idx] = rec

    kept: list[dict[str, Any]] = []
    for i, club in enumerate(clubs):
        rec = decisions_by_idx.get(i)
        if not rec:
            continue
        if rec.get("decision") != "keep":
            continue
        kept.append(
            {
                "name": club.get("name", ""),
                "slug": club.get("slug", ""),
                "url": club.get("url", ""),
                "location": club.get("location", ""),
                "members_count": int(club.get("members_count", 0) or 0),
                "description": club.get("description", ""),
                "created": club.get("created"),
                "classification": "real_club",
                "classification_reason": rec.get("reason", ""),
                "classification_confidence": rec.get("confidence", ""),
                "classification_category": rec.get("category", ""),
            }
        )

    kept.sort(key=lambda x: x.get("members_count", 0), reverse=True)
    OUTPUT_PATH.write_text(json.dumps(kept, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Done. Decisions file: {DECISIONS_PATH}")
    print(f"Done. Postprocessed file: {OUTPUT_PATH}")
    print(f"Kept entries: {len(kept)}")


if __name__ == "__main__":
    main()

