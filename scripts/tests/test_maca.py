from pathlib import Path
import pytest
from bs4 import BeautifulSoup
from events_scrapers.maca import MACAScraper, parse_place, parse_sheet, unwrap

FIXTURES = Path(__file__).parent / 'fixtures'
def soup(name): return BeautifulSoup((FIXTURES / name).read_text(), 'html.parser')
def rows(): return parse_sheet(soup('maca-sheet.html'))
def groups(): return MACAScraper().group(rows())


def test_links_are_unwrapped():
    assert unwrap('https://www.google.com/url?q=http://www.masschess.org/events/Event_Details.aspx?Event_ID%3D9683&sa=D') == 'http://www.masschess.org/events/Event_Details.aspx?Event_ID=9683'


def test_rows_read_dates_with_years():
    assert rows()[0]['date'].isoformat() == '2026-11-11'


def test_tv_shows_club_notices_and_single_rounds_are_excluded():
    names = [g[0]['name'] for g in groups()]
    assert not any('Chess Chat' in n or 'Round 7' in n for n in names)


def test_detail_page_dates_and_fields_replace_sheet_rows():
    group = next(g for g in groups() if 'Event_ID=9683' in (g[0]['url'] or ''))
    e = MACAScraper().build(group, soup('maca-detail.html'))
    assert (e.date, e.endDate) == ('2026-11-04', '2026-11-25')  # The sheet shows only remaining dates.
    assert e.venue.startswith('First Parish Church')
    assert e.address == '24 Vernon Street, Framingham, MA 01701'
    assert e.organizer == 'The MetroWest Chess Club'
    assert e.format == 'classical'
    assert e.entryFeeText == 'MCC members: $32, others $42'
    assert 'Nov 4, Nov 11, Nov 18, Nov 25' in e.scheduleText


def test_events_sharing_an_announcement_get_distinct_identities():
    shared = [g for g in groups() if 'Upcoming' in (g[0]['url'] or '')]
    built = [MACAScraper().build(g) for g in shared]
    assert built and len({e.id for e in built}) == len(built)
    assert built[0].city is None and built[0].state is None  # Location "TBD" stays unknown.


def test_online_in_the_title_removes_the_place():
    group = next(g for g in groups() if 'ONLINE' in g[0]['name'])
    e = MACAScraper().build(group)
    assert e.online is True and e.city is None and e.state is None


def test_club_night_without_time_control_is_not_a_tournament():
    group = next(g for g in groups() if g[0]['name'] == 'Newport Chess Club')
    assert MACAScraper().build(group) is None


def test_place_parsing():
    assert parse_place('Ashland , MA') == ('Ashland', 'MA')
    assert parse_place(', MA') == (None, 'MA')
    assert parse_place('TBD') == (None, None)


def test_changed_pages_fail():
    with pytest.raises(ValueError, match='no event rows'):
        parse_sheet(BeautifulSoup('<table></table>', 'html.parser'))
    group = next(g for g in groups() if 'Event_ID=9683' in (g[0]['url'] or ''))
    with pytest.raises(ValueError, match='missing event fields'):
        MACAScraper().build(group, BeautifulSoup('<h1>Not found</h1>', 'html.parser'))
