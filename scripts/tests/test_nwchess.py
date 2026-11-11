from pathlib import Path
import pytest
from bs4 import BeautifulSoup
from events_scrapers.nwchess import NWChessScraper, decode

FIXTURES = Path(__file__).parent / 'fixtures'
def events():
    raw = (FIXTURES / 'nwchess-calendar.html').read_bytes().decode('latin-1')  # As requests decodes a page with no charset.
    return NWChessScraper().parse(BeautifulSoup(decode(raw), 'html.parser'))
def named(fragment): return next(e for e in events() if fragment in e.name)


def test_year_comes_from_the_section_heading():
    assert named('Thurston County').date == '2027-01-09'
    assert named('Husky Open').date == '2026-11-14'


def test_range_and_listed_dates():
    e = named('Washington Class Championships')
    assert (e.date, e.endDate) == ('2026-11-27', '2026-11-29')
    e = named('November Rains')
    assert (e.date, e.endDate) == ('2026-11-06', '2026-11-20')
    assert 'Nov 6, 13, 20' in e.scheduleText


def test_venue_city_state():
    e = named('Husky Open')
    assert (e.venue, e.city, e.state) == ('UW Husky Union Bldg.', 'Seattle', 'WA')
    assert e.website.endswith('2026%20Husky%20Open.pdf')
    e = named('Thurston County')
    assert (e.venue, e.city, e.state) == ('The Rock Church', 'Olympia', 'WA')


def test_windows_1252_punctuation_survives():
    assert '’' in named('Thurston County').name


def test_canada_is_excluded_and_unknown_place_stays_empty():
    assert not any('BC Open' in e.name or 'American Open' in e.name for e in events())
    e = named('Pierce County Regional')
    assert e.city is None and e.state is None


def test_scholastic_section_marks_audience():
    assert named('St. Anne Celtic Challenge Fall').audience == 'scholastic'
    assert named('Husky Open').audience is None


def test_no_fees_or_time_controls_are_supplied():
    assert all(e.entryFeeText is None and e.timeControl is None for e in events())


def test_ids_are_unique():
    assert len({e.id for e in events()}) == len(events())


def test_changed_page_fails():
    with pytest.raises(ValueError, match='no dated events'):
        NWChessScraper().parse(BeautifulSoup('<ul><li>nothing</li></ul>', 'html.parser'))
