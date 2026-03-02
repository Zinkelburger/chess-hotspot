from __future__ import annotations

"""
CCA scraper in words:
1) Open chesstour.com/refs.html and collect tournament detail links.
2) Ignore blitz-only duplicates when both `xxx26.htm` and `xxxb26.htm` exist.
3) Visit each kept detail page and convert ugly Word-style HTML into clean text.
4) Parse broad event details (name, dates, schedule, venue, prizes, sections,
   fees, points, ratings, contact, links), and keep rich metadata even if the
   UI does not display it yet.
5) Prefer the widest schedule window when multiple schedules are listed
   (ex: 5-day over 4-day over 3-day).
"""

import json
from html import unescape
from html.parser import HTMLParser
import os
from pathlib import Path
import re
import time
from urllib.parse import quote_plus, urljoin, urlparse
from urllib.request import Request, urlopen

from .base import BaseEventScraper, ScrapedEvent


MONTHS = {
    "JANUARY": 1,
    "FEBRUARY": 2,
    "MARCH": 3,
    "APRIL": 4,
    "MAY": 5,
    "JUNE": 6,
    "JULY": 7,
    "AUGUST": 8,
    "SEPTEMBER": 9,
    "OCTOBER": 10,
    "NOVEMBER": 11,
    "DECEMBER": 12,
}


class _HrefCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for key, value in attrs:
            if key.lower() == "href" and value:
                self.hrefs.append(value)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        if t in {"script", "style"}:
            self._skip_depth += 1
            return
        if t in {"br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4"}:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t in {"script", "style"} and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if t in {"p", "div", "li", "tr", "h1", "h2", "h3", "h4"}:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        self._chunks.append(data)

    def text(self) -> str:
        raw = unescape("".join(self._chunks)).replace("\r", "\n")
        raw = raw.replace("\xa0", " ")
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


class CCAScraper(BaseEventScraper):
    source_id = "cca"
    source_url = "https://www.chesstour.com/refs.html"
    words_at_top = (
        "Starts at refs.html, keeps non-blitz canonical links, parses each event "
        "page into broad metadata and primary date window."
    )

    def __init__(self) -> None:
        self.geocode_enabled = os.getenv("CHESS_HOTSPOT_GEOCODE", "1") != "0"
        self.cache_path = Path(__file__).with_name("geocode_cache.json")
        self.geocode_cache: dict[str, dict[str, float] | None] = {}
        if self.cache_path.exists():
            try:
                loaded = json.loads(self.cache_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    self.geocode_cache = loaded
            except Exception:
                self.geocode_cache = {}
        self._geocode_hits_this_run = 0

    def _fetch(self, url: str) -> str:
        req = Request(url, headers={"User-Agent": "chess-hotspot-bot/1.0"})
        with urlopen(req, timeout=30) as res:
            raw = res.read()
            charset = res.headers.get_content_charset() or "windows-1252"
        return raw.decode(charset, errors="replace")

    def _collect_event_links(self, refs_html: str) -> list[str]:
        collector = _HrefCollector()
        collector.feed(refs_html)

        links: set[str] = set()
        for href in collector.hrefs:
            absolute = urljoin(self.source_url, href)
            parsed = urlparse(absolute)
            if parsed.netloc not in {"chesstour.com", "www.chesstour.com"}:
                continue
            if not parsed.path.lower().endswith(".htm"):
                continue
            links.add(f"https://www.chesstour.com{parsed.path}")

        # Keep tournament detail pages; drop known non-event helpers/home pages.
        filtered: dict[str, str] = {}
        for link in sorted(links):
            slug = link.rsplit("/", 1)[-1].replace(".htm", "").lower()
            if slug in {"refs", "index"}:
                continue
            if not re.match(r"^[a-z0-9]+$", slug):
                continue
            if not re.search(r"\d{2}$", slug):
                # CCA event pages almost always end with 2-digit year, e.g. aco26.
                continue

            # Prefer non-blitz page when slug ends with bYY (acob26 -> aco26).
            blitz_match = re.match(r"^(?P<base>[a-z0-9]+)b(?P<yy>\d{2})$", slug)
            if blitz_match:
                canonical = f"{blitz_match.group('base')}{blitz_match.group('yy')}"
                filtered.setdefault(canonical, "")
                continue

            filtered[slug] = link

        return [link for link in filtered.values() if link]

    def _extract_text(self, html: str) -> str:
        extractor = _TextExtractor()
        extractor.feed(html)
        return extractor.text()

    def _lines(self, text: str) -> list[str]:
        return [ln.strip() for ln in text.splitlines() if ln.strip()]

    def _pick_name(self, lines: list[str]) -> str:
        name_parts: list[str] = []
        month_hit = re.compile(
            r"(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)",
            re.IGNORECASE,
        )
        for line in lines[:20]:
            low = line.lower()
            if low in {"home", "more tournaments"}:
                continue
            if "grand prix points" in low or "guaranteed prize" in low:
                continue
            if "new cca event" in low or low in {"a new", "cca event!", "out of state welcome!"}:
                continue
            if "gm & im norms possible" in low:
                continue
            if month_hit.search(line):
                break
            if len(line) < 4:
                continue
            if name_parts and line.startswith("("):
                break
            name_parts.append(line)
            joined = " ".join(name_parts)
            if re.search(r"\b(OPEN|CHAMPIONSHIP|CHAMPIONSHIPS|TOURNAMENT)\b", joined, re.IGNORECASE):
                break
            if len(name_parts) >= 4:
                break

        if not name_parts:
            return "CCA Tournament"

        name = " ".join(name_parts)
        name = re.sub(r"\s+", " ", name).strip()
        return name

    def _pick_primary_date_line(self, lines: list[str]) -> str | None:
        month_regex = r"(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)"
        for line in lines:
            if re.search(month_regex, line.upper()) and re.search(r"20\d{2}", line):
                return line
        return None

    def _date_bounds(self, date_line: str | None) -> tuple[str | None, str | None]:
        if not date_line:
            return None, None

        normalized = date_line.upper().replace("–", "-")
        year_match = re.search(r"(20\d{2})", normalized)
        if not year_match:
            return None, None

        year = int(year_match.group(1))
        month_pattern = (
            r"(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)"
        )
        matches = list(
            re.finditer(
                rf"{month_pattern}\s+(\d{{1,2}})(?:\s*-\s*(\d{{1,2}}))?",
                normalized,
            )
        )
        if not matches:
            return None, None

        ranges: list[tuple[int, int, int]] = []
        for m in matches:
            month = MONTHS[m.group(1)]
            start_day = int(m.group(2))
            end_day = int(m.group(3) or start_day)
            ranges.append((month, start_day, end_day))

        ranges.sort(key=lambda x: (x[0], x[1]))
        start_month, start_day, _ = ranges[0]
        end_month, _, end_day = max(ranges, key=lambda x: (x[0], x[2]))
        start = f"{year:04d}-{start_month:02d}-{start_day:02d}"
        end = f"{year:04d}-{end_month:02d}-{end_day:02d}"
        return start, end

    def _extract_primary_schedule(self, lines: list[str]) -> str | None:
        scored: list[tuple[int, str]] = []
        for line in lines:
            m = re.search(r"(\d+)\s*-\s*Day schedule", line, re.IGNORECASE)
            if not m:
                continue
            scored.append((int(m.group(1)), line))
        if not scored:
            return None
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]

    @staticmethod
    def _parse_usd(raw: str) -> int | None:
        cleaned = raw.replace("$", "").replace(",", "").strip()
        if not cleaned.isdigit():
            return None
        return int(cleaned)

    def _extract_prize_fund_guaranteed(self, text: str) -> int | None:
        m = re.search(r"\$([\d,]+)\s+(?:TOTAL\s+)?GUARANTEED", text, re.IGNORECASE)
        return self._parse_usd(m.group(1)) if m else None

    def _extract_entry_fee_range(self, text: str) -> tuple[str | None, int | None, int | None]:
        m = re.search(r"Entry Fee:?\s*([^\n]+)", text, re.IGNORECASE)
        if not m:
            return None, None, None
        fee_text = m.group(1).strip()
        values = [self._parse_usd(x) for x in re.findall(r"\$[\d,]+", fee_text)]
        nums = [x for x in values if x is not None]
        if not nums:
            return fee_text, None, None
        return fee_text, min(nums), max(nums)

    def _extract_top_prize(self, lines: list[str]) -> int | None:
        for line in lines:
            if "Section:" in line:
                money = re.findall(r"\$[\d,]+", line)
                if money:
                    return self._parse_usd(money[0])
        headline = next((ln for ln in lines if "GUARANTEED PRIZES" in ln.upper()), None)
        if headline:
            m = re.search(r"\$([\d,]+)", headline)
            if m:
                return self._parse_usd(m.group(1))
        return None

    def _extract_time_control(self, text: str) -> tuple[dict[str, object] | None, str | None]:
        m = re.search(r"G\/(\d+)\s*[;,]?\s*(?:\+(\d+)|d(\d+))?", text, re.IGNORECASE)
        if not m:
            return None, None
        base = int(m.group(1))
        inc = int(m.group(2)) if m.group(2) else None
        delay = int(m.group(3)) if m.group(3) else None
        kind = "classical" if base >= 60 else "rapid" if base >= 10 else "blitz"
        tc: dict[str, object] = {"kind": kind, "baseMinutes": base, "raw": m.group(0)}
        if inc is not None:
            tc["incrementSeconds"] = inc
        if delay is not None:
            tc["delaySeconds"] = delay
        return tc, kind

    def _extract_sections(self, lines: list[str]) -> list[dict[str, object]]:
        out: list[dict[str, object]] = []
        for line in lines:
            if not re.match(
                r"^(Open Section:|Major Section|Master Section|Expert Section|Class [A-E] Section|Under \d{3,4}/?Unr:)",
                line,
                re.IGNORECASE,
            ):
                continue
            head = line.split(":", 1)[0].strip()
            sec: dict[str, object] = {"name": head.replace(" Section", "").strip(), "raw": line}
            u = re.search(r"Under\s+(\d{3,4})", head, re.IGNORECASE)
            if u:
                sec["maxRating"] = int(u.group(1))
            elif re.search(r"(Open|Major|Master)", head, re.IGNORECASE):
                sec["minRating"] = 1900
            prizes = [self._parse_usd(x) for x in re.findall(r"\$[\d,]+", line)]
            prize_values = [x for x in prizes if x is not None]
            if prize_values:
                sec["prizes"] = [{"amountUsd": p} for p in prize_values[:6]]
            sec["unratedAllowed"] = bool(re.search(r"(Unr|Unrated)", line, re.IGNORECASE))
            out.append(sec)
        return out

    def _extract_schedule_options(
        self,
        lines: list[str],
        start_date: str | None,
        end_date: str | None,
    ) -> list[dict[str, object]]:
        options: list[dict[str, object]] = []
        for line in lines:
            m = re.search(r"(\d+)\s*-\s*day schedule[^:]*:\s*(.+)", line, re.IGNORECASE)
            if not m:
                continue
            day_count = int(m.group(1))
            options.append(
                {
                    "name": f"{day_count}-Day",
                    "startDate": start_date,
                    "endDate": end_date,
                    "raw": line,
                }
            )
        return options

    def _extract_address(self, text: str) -> str | None:
        normalized = re.sub(r"\s+", " ", text)
        match = re.search(
            r"(\d{2,6}\s+[A-Za-z0-9 .#'()\-]+,\s*[A-Za-z .'\-]+,\s*[A-Z]{2}\s*\d{5})",
            normalized,
        )
        if match:
            return match.group(1).strip()
        return None

    def _extract_venue(self, lines: list[str], address: str | None) -> str | None:
        for line in lines[:80]:
            venue_match = re.search(
                r"([A-Z][A-Za-z0-9 '&.\-]*(Hotel|Resort|Casino|Center|Centre|Marriott|Hilton|Westin)[A-Za-z0-9 '&.\-]*)",
                line,
                re.IGNORECASE,
            )
            if venue_match:
                candidate = venue_match.group(1).strip(" ,.")
                if candidate.lower() == "fitness center":
                    continue
                if "your hotel room" in candidate.lower():
                    continue
                candidate = re.sub(r"^[a-z]\d+\.\s*", "", candidate, flags=re.IGNORECASE)
                return candidate

        if address:
            for line in lines:
                normalized_line = re.sub(r"\s+", " ", line)
                if address in normalized_line:
                    left = normalized_line.split(address, 1)[0].strip(" ,.-")
                    # If the left side includes prior sentence noise, keep final phrase only.
                    if ". " in left:
                        left = left.split(". ")[-1].strip()
                    if ") " in left:
                        left = left.split(") ")[-1].strip()
                    left = re.sub(r"^[a-z0-9/;:() .-]+", "", left, flags=re.IGNORECASE)
                    parts = [x.strip() for x in left.split(",") if x.strip()]
                    if parts:
                        candidate = parts[-1]
                        if re.search(
                            r"(Hotel|Resort|Casino|Center|Centre|Marriott|Hilton|Westin)",
                            candidate,
                            re.IGNORECASE,
                        ):
                            candidate = re.sub(r"^[a-z]\d+\.\s*", "", candidate, flags=re.IGNORECASE)
                            return candidate
        return None

    def _geocode(self, address: str | None) -> tuple[float | None, float | None]:
        if not address or not self.geocode_enabled:
            return None, None

        if address in self.geocode_cache:
            cached = self.geocode_cache[address]
            if cached is not None:
                return cached.get("lat"), cached.get("lng")

        queries = [address]
        simplified = re.sub(r"\([^)]*\)", "", address).replace("  ", " ").strip(" ,")
        if simplified and simplified not in queries:
            queries.append(simplified)
        city_state_zip = re.search(r"([A-Za-z .'\-]+,\s*[A-Z]{2}\s*\d{5})$", simplified)
        if city_state_zip:
            queries.append(city_state_zip.group(1).strip())

        for query in queries:
            url = (
                "https://nominatim.openstreetmap.org/search"
                f"?format=json&limit=1&q={quote_plus(query)}"
            )
            req = Request(
                url,
                headers={"User-Agent": "chess-hotspot-bot/1.0 (local scraper)"},
            )
            try:
                with urlopen(req, timeout=30) as res:
                    payload = json.loads(res.read().decode("utf-8", errors="replace"))
                if isinstance(payload, list) and payload:
                    lat = float(payload[0]["lat"])
                    lng = float(payload[0]["lon"])
                    self.geocode_cache[address] = {"lat": lat, "lng": lng}
                    self._geocode_hits_this_run += 1
                    time.sleep(1.0)
                    return lat, lng
            except Exception:
                pass

        self.geocode_cache[address] = None
        return None, None

    def scrape(self) -> list[ScrapedEvent]:
        refs_html = self._fetch(self.source_url)
        event_links = self._collect_event_links(refs_html)
        events: list[ScrapedEvent] = []

        for link in event_links:
            try:
                html = self._fetch(link)
            except Exception as exc:  # pragma: no cover
                print(f"[cca] skip {link} ({exc})")
                continue

            text = self._extract_text(html)
            lines = self._lines(text)
            name = self._pick_name(lines)
            date_line = self._pick_primary_date_line(lines)
            start_date, end_date = self._date_bounds(date_line)
            if not start_date:
                continue

            address = self._extract_address(text)
            venue = self._extract_venue(lines, address)
            lat, lng = self._geocode(address)

            prize_fund = self._extract_prize_fund_guaranteed(text)
            entry_text, entry_min, entry_max = self._extract_entry_fee_range(text)
            top_prize = self._extract_top_prize(lines)
            time_control, event_format = self._extract_time_control(text)
            sections = self._extract_sections(lines)
            schedule_options = self._extract_schedule_options(lines, start_date, end_date)

            rating_system = "none"
            rated = False
            if re.search(r"FIDE rated", text, re.IGNORECASE):
                rating_system = "FIDE"
                rated = True
            elif re.search(r"USCF[- ]?rated|US Chess[- ]?rated", text, re.IGNORECASE):
                rating_system = "USCF"
                rated = True

            event = ScrapedEvent(
                id=self.build_event_id(name, start_date, link),
                name=name,
                date=start_date,
                endDate=end_date,
                venue=venue,
                address=address,
                lat=lat,
                lng=lng,
                format=event_format,
                timeControl=time_control,
                rated=rated,
                ratingSystem=rating_system,
                entryFeeText=entry_text,
                entryFeeUsdMin=entry_min,
                entryFeeUsdMax=entry_max,
                prizeFundGuaranteedUsd=prize_fund,
                topPrizeUsd=top_prize,
                sections=sections or None,
                scheduleOptions=schedule_options or None,
                tags=["cca", "tournament"],
                website=link,
                notes=(
                    "Auto-scraped from CCA tournament page. Verify details before attending."
                ),
            )
            events.append(event)

        if self.geocode_enabled:
            self.cache_path.write_text(
                json.dumps(self.geocode_cache, indent=2) + "\n",
                encoding="utf-8",
            )

        return events
