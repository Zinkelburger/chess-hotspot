#!/usr/bin/env python3
"""
Scrape all USCF clubs/affiliates from the US Chess Federation club directory.

Iterates through every state/territory by state_province_id, parses the HTML
for each page, and writes structured JSON to data/uscf_clubs.json.

Usage:
    python scripts/scrape_clubs.py
    python scripts/scrape_clubs.py --output data/uscf_clubs.json
    python scripts/scrape_clubs.py --states Wyoming Montana  # specific states only
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from html import unescape
from pathlib import Path
from urllib.request import Request, urlopen

BASE_URL = "https://new.uschess.org/club-search-and-affiliate-directory"

STATE_IDS: dict[str, str] = {
    "1000": "Alabama",
    "1001": "Alaska",
    "1002": "Arizona",
    "1003": "Arkansas",
    "1004": "California",
    "1005": "Colorado",
    "1006": "Connecticut",
    "1007": "Delaware",
    "1008": "Florida",
    "1009": "Georgia",
    "1010": "Hawaii",
    "1011": "Idaho",
    "1012": "Illinois",
    "1013": "Indiana",
    "1014": "Iowa",
    "1015": "Kansas",
    "1016": "Kentucky",
    "1017": "Louisiana",
    "1018": "Maine",
    "1019": "Maryland",
    "1020": "Massachusetts",
    "1021": "Michigan",
    "1022": "Minnesota",
    "1023": "Mississippi",
    "1024": "Missouri",
    "1025": "Montana",
    "1026": "Nebraska",
    "1027": "Nevada",
    "1028": "New Hampshire",
    "1029": "New Jersey",
    "1030": "New Mexico",
    "1031": "New York",
    "1032": "North Carolina",
    "1033": "North Dakota",
    "1034": "Ohio",
    "1035": "Oklahoma",
    "1036": "Oregon",
    "1037": "Pennsylvania",
    "1038": "Rhode Island",
    "1039": "South Carolina",
    "1040": "South Dakota",
    "1041": "Tennessee",
    "1042": "Texas",
    "1043": "Utah",
    "1044": "Vermont",
    "1045": "Virginia",
    "1046": "Washington",
    "1047": "West Virginia",
    "1048": "Wisconsin",
    "1049": "Wyoming",
    "1050": "District of Columbia",
    "1052": "American Samoa",
    "1053": "Guam",
    "1055": "Northern Mariana Islands",
    "1056": "Puerto Rico",
    "1057": "Virgin Islands",
    "1058": "United States Minor Outlying Islands",
    "1059": "Armed Forces Europe",
    "1060": "Armed Forces Americas",
    "1061": "Armed Forces Pacific",
}

ID_BY_STATE = {v: k for k, v in STATE_IDS.items()}


def _fetch(url: str) -> str:
    req = Request(url, headers={"User-Agent": "chess-hotspot-bot/1.0 (club scraper)"})
    with urlopen(req, timeout=30) as res:
        raw = res.read()
        charset = res.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def _decode_cf_email(encoded: str) -> str:
    """Decode Cloudflare's email obfuscation (XOR cipher)."""
    key = int(encoded[:2], 16)
    return "".join(
        chr(int(encoded[i : i + 2], 16) ^ key)
        for i in range(2, len(encoded), 2)
    )


def _strip_tags(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _get_field_content(row_html: str, css_class: str) -> str | None:
    """Find a views-field block by CSS class and return its field-content text."""
    pattern = rf'class="[^"]*{re.escape(css_class)}[^"]*"'
    m = re.search(pattern, row_html, re.IGNORECASE)
    if not m:
        return None

    after = row_html[m.start():]
    fc = re.search(
        r'<(?:span|strong) class="field-content">(.*?)</(?:span|strong)>',
        after,
        re.DOTALL | re.IGNORECASE,
    )
    if not fc:
        return None
    return fc.group(1)


def _extract_field(row_html: str, css_class: str) -> str | None:
    raw = _get_field_content(row_html, css_class)
    if raw is None:
        return None
    text = _strip_tags(raw).strip()
    return text if text else None


def _extract_link(row_html: str, css_class: str) -> str | None:
    raw = _get_field_content(row_html, css_class)
    if raw is None:
        return None
    link_match = re.search(r'href="([^"]+)"', raw)
    return link_match.group(1) if link_match else None


def _extract_email(row_html: str) -> str | None:
    raw = _get_field_content(row_html, "views-field-email")
    if raw is None:
        return None

    cf = re.search(r'data-cfemail="([a-f0-9]+)"', raw, re.IGNORECASE)
    if cf:
        return _decode_cf_email(cf.group(1))

    mailto = re.search(r'href="mailto:([^"]+)"', raw, re.IGNORECASE)
    if mailto:
        return unescape(mailto.group(1))

    plain = _strip_tags(raw)
    if "@" in plain:
        return plain

    return None


def _parse_name_and_id(raw: str | None) -> tuple[str, str | None]:
    if not raw:
        return ("Unknown", None)
    m = re.match(r"^(.+?)\s*\(([A-Z]\d+)\)\s*$", raw)
    if m:
        return (m.group(1).strip(), m.group(2))
    return (raw.strip(), None)


def _parse_address(raw: str | None) -> str | None:
    if not raw:
        return None
    text = re.sub(r"^Address:\s*", "", raw, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s+", " ", text)
    return text if text else None


def parse_clubs_from_html(html: str) -> list[dict]:
    """Parse all club entries from a single state page."""
    parts = re.split(r'<div class="views-row">', html)
    row_blocks = parts[1:]  # skip everything before the first row

    clubs: list[dict] = []
    for block in row_blocks:
        name_raw = _extract_field(block, "views-field-display-name")
        name, uscf_id = _parse_name_and_id(name_raw)

        city = _extract_field(block, "views-field-nothing-2")
        affiliate_type = _extract_field(block, "views-field-club-directory-affiliate-type-89")
        address_raw = _extract_field(block, "views-field-nothing-4")
        address = _parse_address(address_raw)
        website = _extract_link(block, "views-field-url")
        email = _extract_email(block)
        phone = _extract_field(block, "views-field-phone")
        activities = _extract_field(block, "views-field-club-activities-90")
        additional_info = _extract_field(block, "views-field-custom-84")

        if not name or name == "Unknown":
            continue

        club: dict = {"name": name}
        if uscf_id:
            club["uscf_id"] = uscf_id
        if city:
            club["city"] = city
        if affiliate_type:
            atype = re.sub(r"^Affiliate Type:\s*", "", affiliate_type).strip()
            club["affiliate_type"] = atype
        if address:
            club["address"] = address
        if website:
            club["website"] = website
        if email:
            club["email"] = email
        if phone:
            p = re.sub(r"^Phone:\s*", "", phone).strip()
            club["phone"] = p
        if activities:
            act = re.sub(r"^Club Activities:\s*", "", activities).strip()
            act_list = [a.strip() for a in act.split(",") if a.strip()]
            club["activities"] = act_list
        if additional_info:
            club["additional_info"] = additional_info

        clubs.append(club)

    return clubs


def scrape_state(state_id: str, state_name: str) -> list[dict]:
    url = (
        f"{BASE_URL}"
        f"?display_name="
        f"&state_province_id[]={state_id}"
        f"&proximity[city]="
        f"&proximity[state_province_id]="
        f"&proximity[value]="
        f"&proximity[distance]="
        f"&proximity[distance_unit]=miles"
    )
    print(f"  Fetching {state_name} (id={state_id})...", end=" ", flush=True)
    try:
        html = _fetch(url)
    except Exception as exc:
        print(f"FAILED ({exc})")
        return []

    clubs = parse_clubs_from_html(html)
    print(f"{len(clubs)} clubs")
    return clubs


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape USCF club directory into JSON."
    )
    parser.add_argument(
        "--output",
        default="data/uscf_clubs.json",
        help="Output JSON path (default: data/uscf_clubs.json)",
    )
    parser.add_argument(
        "--states",
        nargs="*",
        help="Only scrape specific states (by name, e.g. --states Wyoming Montana)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="Delay between requests in seconds (default: 1.5)",
    )
    args = parser.parse_args()

    if args.states:
        targets = {}
        for name in args.states:
            sid = ID_BY_STATE.get(name)
            if not sid:
                close = [s for s in ID_BY_STATE if name.lower() in s.lower()]
                if close:
                    sid = ID_BY_STATE[close[0]]
                    name = close[0]
                else:
                    print(f"Unknown state: {name}", file=sys.stderr)
                    sys.exit(1)
            targets[sid] = name
    else:
        targets = dict(STATE_IDS)

    all_clubs: dict[str, list[dict]] = {}
    total = 0

    print(f"Scraping {len(targets)} state/territory pages...\n")

    for i, (sid, name) in enumerate(sorted(targets.items(), key=lambda x: x[1])):
        clubs = scrape_state(sid, name)
        if clubs:
            all_clubs[name] = clubs
            total += len(clubs)

        if i < len(targets) - 1:
            time.sleep(args.delay)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(all_clubs, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\nDone. {total} clubs across {len(all_clubs)} states -> {out_path}")


if __name__ == "__main__":
    main()
