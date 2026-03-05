"""Tests for CCAScraper extraction methods against real CCA event pages."""

from __future__ import annotations

import pytest

from events_scrapers.cca import CCAScraper


# ---------------------------------------------------------------------------
# Name extraction
# ---------------------------------------------------------------------------

class TestPickName:
    def test_aco26(self, scraper, aco26):
        _, _, lines = aco26
        assert scraper._pick_name(lines) == "The Atlantic City Open"

    def test_scc26(self, scraper, scc26):
        _, _, lines = scc26
        name = scraper._pick_name(lines)
        assert "SOUTHERN CLASS CHAMPIONSHIPS" in name.upper()

    def test_gwo26(self, scraper, gwo26):
        _, _, lines = gwo26
        name = scraper._pick_name(lines)
        assert "GEORGE WASHINGTON OPEN" in name.upper()


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------

class TestDates:
    def test_aco26_dates(self, scraper, aco26):
        _, _, lines = aco26
        date_line = scraper._pick_primary_date_line(lines)
        assert date_line is not None
        start, end = scraper._date_bounds(date_line)
        assert start == "2026-04-01"
        assert end == "2026-04-05"

    def test_scc26_no_date_line(self, scraper, scc26):
        _, _, lines = scc26
        date_line = scraper._pick_primary_date_line(lines)
        # SCC26 page currently lacks a parseable date line
        assert date_line is None

    def test_gwo26_dates(self, scraper, gwo26):
        _, _, lines = gwo26
        date_line = scraper._pick_primary_date_line(lines)
        assert date_line is not None
        start, end = scraper._date_bounds(date_line)
        assert start == "2026-02-27"
        assert end == "2026-03-01"

    def test_date_bounds_none_input(self, scraper):
        assert scraper._date_bounds(None) == (None, None)

    def test_date_bounds_no_year(self, scraper):
        assert scraper._date_bounds("MARCH 5-7") == (None, None)


# ---------------------------------------------------------------------------
# Address extraction
# ---------------------------------------------------------------------------

class TestAddress:
    def test_aco26_address(self, scraper, aco26):
        _, text, _ = aco26
        addr = scraper._extract_address(text)
        assert addr is not None
        assert "Atlantic City" in addr
        assert "NJ" in addr
        assert "08401" in addr

    def test_scc26_address(self, scraper, scc26):
        _, text, _ = scc26
        addr = scraper._extract_address(text)
        assert addr is not None
        assert "Kissimmee" in addr
        assert "FL" in addr

    def test_gwo26_address(self, scraper, gwo26):
        _, text, _ = gwo26
        addr = scraper._extract_address(text)
        assert addr is not None
        assert "Dulles" in addr or "Aviation" in addr
        assert "VA" in addr


# ---------------------------------------------------------------------------
# Venue extraction
# ---------------------------------------------------------------------------

class TestVenue:
    def test_gwo26_marriott(self, scraper, gwo26):
        _, _, lines = gwo26
        addr = "45020 Aviation Drive, Dulles, VA 20166"
        venue = scraper._extract_venue(lines, addr)
        assert venue is not None
        assert "Marriott" in venue

    def test_venue_none_when_no_match(self, scraper):
        lines = ["Hello world", "Nothing relevant here"]
        assert scraper._extract_venue(lines, None) is None


# ---------------------------------------------------------------------------
# Prize fund
# ---------------------------------------------------------------------------

class TestPrizeFund:
    def test_aco26_prize_fund(self, scraper, aco26):
        _, text, _ = aco26
        pf = scraper._extract_prize_fund_guaranteed(text)
        assert pf == 40000

    def test_scc26_prize_fund(self, scraper, scc26):
        _, text, _ = scc26
        pf = scraper._extract_prize_fund_guaranteed(text)
        assert pf == 17000

    def test_gwo26_prize_fund(self, scraper, gwo26):
        _, text, _ = gwo26
        pf = scraper._extract_prize_fund_guaranteed(text)
        assert pf == 17000

    def test_no_prize_fund(self, scraper):
        assert scraper._extract_prize_fund_guaranteed("no prizes here") is None


# ---------------------------------------------------------------------------
# Entry fee
# ---------------------------------------------------------------------------

class TestEntryFee:
    def test_aco26_fee(self, scraper, aco26):
        _, text, _ = aco26
        fee_text, fee_min, fee_max = scraper._extract_entry_fee_range(text)
        assert fee_text is not None
        assert fee_min == 218

    def test_scc26_fee(self, scraper, scc26):
        _, text, _ = scc26
        fee_text, fee_min, fee_max = scraper._extract_entry_fee_range(text)
        assert fee_min == 118

    def test_no_fee(self, scraper):
        text, mn, mx = scraper._extract_entry_fee_range("no fees listed")
        assert text is None
        assert mn is None


# ---------------------------------------------------------------------------
# Time control
# ---------------------------------------------------------------------------

class TestTimeControl:
    def test_aco26_time_control(self, scraper, aco26):
        _, text, _ = aco26
        tc, fmt = scraper._extract_time_control(text)
        assert tc is not None
        assert tc["kind"] == "classical"
        assert tc["baseMinutes"] == 60
        assert tc["delaySeconds"] == 10
        assert fmt == "classical"

    def test_rapid_detection(self, scraper):
        tc, fmt = scraper._extract_time_control("Time control: G/25 d5")
        assert tc is not None
        assert tc["kind"] == "rapid"
        assert fmt == "rapid"

    def test_blitz_detection(self, scraper):
        tc, fmt = scraper._extract_time_control("G/5 +2 blitz")
        assert tc is not None
        assert tc["kind"] == "blitz"
        assert tc["incrementSeconds"] == 2

    def test_no_tc(self, scraper):
        tc, fmt = scraper._extract_time_control("no time control info")
        assert tc is None
        assert fmt is None


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------

class TestSections:
    def test_aco26_sections(self, scraper, aco26):
        _, _, lines = aco26
        sections = scraper._extract_sections(lines)
        assert len(sections) >= 5
        names = [s["name"] for s in sections]
        assert "Open" in names

    def test_scc26_sections(self, scraper, scc26):
        _, _, lines = scc26
        sections = scraper._extract_sections(lines)
        assert len(sections) >= 5
        names = [s["name"] for s in sections]
        assert any("Master" in n for n in names)

    def test_sections_with_rating_cap(self, scraper, aco26):
        _, _, lines = aco26
        sections = scraper._extract_sections(lines)
        under_sections = [s for s in sections if "maxRating" in s]
        assert len(under_sections) >= 4
        ratings = [s["maxRating"] for s in under_sections]
        assert 2200 in ratings or 2000 in ratings

    def test_empty_sections(self, scraper):
        assert scraper._extract_sections(["nothing here"]) == []


# ---------------------------------------------------------------------------
# Schedule options
# ---------------------------------------------------------------------------

class TestScheduleOptions:
    def test_aco26_schedule(self, scraper, aco26):
        _, _, lines = aco26
        opts = scraper._extract_schedule_options(lines, "2026-04-01", "2026-04-05")
        assert len(opts) >= 2
        names = [o["name"] for o in opts]
        assert "4-Day" in names or "3-Day" in names

    def test_scc26_schedule(self, scraper, scc26):
        _, _, lines = scc26
        opts = scraper._extract_schedule_options(lines, "2026-01-01", "2026-01-03")
        assert len(opts) >= 2

    def test_empty_schedule(self, scraper):
        assert scraper._extract_schedule_options(["nothing"], None, None) == []


# ---------------------------------------------------------------------------
# Text extraction / HTML -> text pipeline
# ---------------------------------------------------------------------------

class TestTextExtraction:
    def test_strips_scripts_and_styles(self, scraper):
        html = "<html><style>body{}</style><script>alert(1)</script><p>Hello</p></html>"
        text = scraper._extract_text(html)
        assert "Hello" in text
        assert "alert" not in text
        assert "body{}" not in text

    def test_collapses_whitespace(self, scraper):
        html = "<p>  lots   of    spaces  </p>"
        text = scraper._extract_text(html)
        assert "  " not in text
        assert "lots of spaces" in text

    def test_real_page_produces_text(self, scraper, aco26):
        html, text, lines = aco26
        assert len(text) > 100
        assert len(lines) > 10


# ---------------------------------------------------------------------------
# _parse_usd helper
# ---------------------------------------------------------------------------

class TestParseUsd:
    def test_simple(self):
        assert CCAScraper._parse_usd("$5,000") == 5000

    def test_no_dollar(self):
        assert CCAScraper._parse_usd("5000") == 5000

    def test_invalid(self):
        assert CCAScraper._parse_usd("free") is None

    def test_empty(self):
        assert CCAScraper._parse_usd("$") is None


# ---------------------------------------------------------------------------
# Link collection
# ---------------------------------------------------------------------------

class TestCollectEventLinks:
    def test_filters_non_chesstour(self, scraper):
        html = '<a href="https://google.com/foo.htm">G</a><a href="aco26.htm">A</a>'
        scraper.source_url = "https://www.chesstour.com/refs.html"
        links = scraper._collect_event_links(html)
        assert all("chesstour.com" in link for link in links)

    def test_drops_refs_and_index(self, scraper):
        html = '<a href="refs.htm">R</a><a href="index.htm">I</a><a href="aco26.htm">A</a>'
        scraper.source_url = "https://www.chesstour.com/refs.html"
        links = scraper._collect_event_links(html)
        slugs = [l.rsplit("/", 1)[-1] for l in links]
        assert "refs.htm" not in slugs
        assert "index.htm" not in slugs

    def test_prefers_non_blitz(self, scraper):
        html = '<a href="aco26.htm">A</a><a href="acob26.htm">B</a>'
        scraper.source_url = "https://www.chesstour.com/refs.html"
        links = scraper._collect_event_links(html)
        slugs = [l.rsplit("/", 1)[-1] for l in links]
        assert "aco26.htm" in slugs
        assert "acob26.htm" not in slugs
