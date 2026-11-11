import json
from pathlib import Path
import pytest
from events_scrapers.chessreg import ChessRegScraper, parse_address

FIXTURES = Path(__file__).parent / 'fixtures'
def payload(): return json.loads((FIXTURES / 'chessreg-tournaments.json').read_text())
def named(fragment): return next(e for e in ChessRegScraper().parse(payload()) if fragment in e.name)


def test_reads_structured_fields():
    e = named('Fall Family Pizza Quads')
    assert (e.date, e.time, e.timezone) == ('2026-11-13', '19:00', 'America/Los_Angeles')
    assert (e.city, e.state) == ('Bellevue', 'WA')
    assert e.address == '13620 NE 20th St Suite K, Bellevue, WA 98005'
    assert e.website == 'https://chessreg.com/gk1113'
    assert '$35.00' in e.entryFeeText and e.entryFeeUsdMin is None
    assert 'November 13, 2026 at 3:00 PM' in e.registrationText


def test_no_end_date_is_invented():
    assert named('Norman Friedman').endDate is None


def test_zero_price_says_nothing_about_entry():
    assert named('Waypoint').entryFeeText is None


def test_address_outside_the_expected_form_leaves_place_empty():
    assert parse_address('TBD') == (None, None)
    assert parse_address('Post Falls, ID 83854, USA') == ('Post Falls', 'ID')


def test_changed_api_fails():
    with pytest.raises(ValueError, match='expected a list'):
        ChessRegScraper().parse({'error': 'gone'})
    with pytest.raises(ValueError, match='no tournaments'):
        ChessRegScraper().parse([])
