from __future__ import annotations

from pathlib import Path

import pytest

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from events_scrapers.cca import CCAScraper


FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture()
def scraper():
    s = CCAScraper()
    s.geocode_enabled = False
    return s


def _load(scraper: CCAScraper, slug: str):
    html = (FIXTURES / f"{slug}.htm").read_text(encoding="utf-8")
    text = scraper._extract_text(html)
    lines = scraper._lines(text)
    return html, text, lines


@pytest.fixture()
def aco26(scraper):
    return _load(scraper, "aco26")


@pytest.fixture()
def scc26(scraper):
    return _load(scraper, "scc26")


@pytest.fixture()
def gwo26(scraper):
    return _load(scraper, "gwo26")
