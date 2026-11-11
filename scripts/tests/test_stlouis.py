from pathlib import Path
import pytest
from bs4 import BeautifulSoup
from events_scrapers.stlouis import SaintLouisScraper, event_links

FIXTURES = Path(__file__).parent / 'fixtures'
def soup(name): return BeautifulSoup((FIXTURES / name).read_text(), 'html.parser')
URL = 'https://saintlouischessclub.org/event/x/'


def test_respects_the_sites_crawl_delay():
    assert SaintLouisScraper().client.delay == 10


def test_open_tournament_fields():
    e = SaintLouisScraper().parse_page(URL, soup('stlouis-open.html'))
    assert e.name == 'Kent Family Thanksgiving Open 2026'
    assert (e.date, e.endDate) == ('2026-11-13', '2026-11-15')
    assert e.format == 'classical' and e.timeControl['incrementSeconds'] == 30
    assert e.entryFeeText == '$100 per player. Free entry for GMs and IMs'
    assert 'Begins Friday at 6:30 PM' in e.scheduleText
    assert '4:30 PM' in e.registrationText
    assert (e.city, e.state) == ('St. Louis', 'MO')


def test_recurring_event_records_only_its_next_date():
    e = SaintLouisScraper().parse_page(URL, soup('stlouis-quads.html'))
    assert (e.date, e.endDate) == ('2026-11-20', '2026-11-20')


def test_category_page_links_exclude_the_site_menu():
    links = event_links(soup('stlouis-weekly.html'))
    assert any('friday-night-quads' in u for u in links)
    assert not any('class' in u or 'lecture' in u for u in links)


def test_finished_event_stub_is_skipped_not_an_error():
    stub = BeautifulSoup('<p>Chess Tournament | May Knights 2026</p><p>Sorry, Online Registration is Closed</p><p>Questions?</p>', 'html.parser')
    assert SaintLouisScraper().parse_page(URL, stub) is None
    past = BeautifulSoup('<p>2026 Masters</p><p>This event has already taken place. All information below is for reference only.</p>', 'html.parser')
    assert SaintLouisScraper().parse_page(URL, past) is None


def test_changed_pages_fail():
    with pytest.raises(ValueError, match='missing event fields'):
        SaintLouisScraper().parse_page(URL, BeautifulSoup('<h1>Not found</h1>', 'html.parser'))
