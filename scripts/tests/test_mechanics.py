from datetime import date
from pathlib import Path
import pytest
from bs4 import BeautifulSoup
from events_scrapers.mechanics import MechanicsScraper, parse_when

FIXTURES = Path(__file__).parent / 'fixtures'
def soup(name): return BeautifulSoup((FIXTURES / name).read_text(), 'html.parser')
URL = 'https://www.milibrary.org/chess/tournaments/x'


def test_listing_names_exclude_the_date_prefix():
    found = MechanicsScraper().parse_listing(soup('mechanics-tournaments.html'))
    names = [name for name, _ in found.values()]
    assert '4th Shipman Memorial Tournament' in names
    assert '2026 Winter Tuesday Night Marathon' in names


def test_detail_reads_labelled_fields():
    e = MechanicsScraper().detail(URL, '25th Bagby Memorial Tournament', 'Club Event', soup('mechanics-detail.html'))
    assert (e.date, e.endDate) == ('2026-12-13', '2026-12-13')
    assert e.format == 'rapid' and e.timeControl == {'kind': 'rapid', 'baseMinutes': 40.0, 'raw': '40 min basetime + 5 sec delay', 'delaySeconds': 5}
    assert 'Members: $40' in e.entryFeeText and 'Non-Members: $50' in e.entryFeeText
    assert 'admin' not in e.entryFeeText
    assert 'Onsite Registration' in e.registrationText
    assert e.ratingSystem == 'USCF' and e.fideRated is False
    assert (e.city, e.state) == ('San Francisco', 'CA')


def test_weekend_range_and_fide():
    e = MechanicsScraper().detail(URL, 'Shipman', 'Club Event', soup('mechanics-weekend.html'))
    assert (e.date, e.endDate) == ('2026-11-21', '2026-11-22')
    assert e.fideRated is True


@pytest.mark.parametrize('raw,expected', [
    ('Sun, Dec 13 , 2026', ('2026-12-13', '2026-12-13')),
    ('Sat, Nov 21 - Sun, Nov 22 , 2026', ('2026-11-21', '2026-11-22')),
    ('Tue, Sep 1 - Sun, May 30 , 2027', ('2026-09-01', '2027-05-30')),
])
def test_date_forms(raw, expected):
    start, end = parse_when(raw)
    assert (start.isoformat(), end.isoformat()) == expected


def test_changed_page_fails():
    with pytest.raises(ValueError, match='missing event fields'):
        MechanicsScraper().detail(URL, 'x', 'y', BeautifulSoup('<h1>Not found</h1>', 'html.parser'))
    with pytest.raises(ValueError, match='no entries'):
        MechanicsScraper().parse_listing(BeautifulSoup('<ul></ul>', 'html.parser'))
    with pytest.raises(ValueError, match='Unrecognized'):
        parse_when('sometime')
