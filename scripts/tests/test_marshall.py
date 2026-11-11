from datetime import date
from pathlib import Path
import pytest
from bs4 import BeautifulSoup
from events_scrapers.marshall import MarshallScraper, parse_dates

FIXTURES = Path(__file__).parent / 'fixtures'
TODAY = date(2026, 11, 11)
def events(): return MarshallScraper().parse(BeautifulSoup((FIXTURES / 'marshall-upcoming.html').read_text(), 'html.parser'), TODAY)


def test_series_keeps_its_first_to_last_window():
    e = next(e for e in events() if e.name == 'WEEKLY U2200' and e.date.startswith('2026-10'))
    assert (e.date, e.endDate) == ('2026-10-07', '2026-11-11')
    assert e.dateText == 'Oct 7, 14, 21, 28, Nov 4, 11'
    assert e.format == 'classical' and e.timeControl['incrementSeconds'] == 30
    assert '$50' in e.entryFeeText and 'Members only' in e.entryFeeText
    assert e.scheduleText == '7pm each Wed.'
    assert e.fideRated is True


def test_venue_is_the_club():
    e = events()[0]
    assert (e.city, e.state, e.online) == ('New York', 'NY', False)
    assert '23 West 10th Street' in e.address


def test_classes_and_casual_nights_are_excluded():
    assert not any('Class' in e.name or 'Casual' in e.name or 'Pizza' in e.name for e in events())


def test_dates_across_new_year_advance_the_year():
    dates = parse_dates('Dec 30, Jan 6, 13', TODAY)
    assert [d.isoformat() for d in dates] == ['2026-12-30', '2027-01-06', '2027-01-13']


def test_early_months_read_in_autumn_are_next_year():
    assert parse_dates('Feb 3', TODAY)[0] == date(2027, 2, 3)
    assert parse_dates('Dec 30', date(2027, 1, 2))[0] == date(2026, 12, 30)


def test_identity_does_not_depend_on_registration_link():
    assert all('#' in e.website for e in events())
    assert len({e.id for e in events()}) == len(events())


def test_changed_page_fails():
    with pytest.raises(ValueError, match='no tournaments'):
        MarshallScraper().parse(BeautifulSoup('<table></table>', 'html.parser'), TODAY)
    with pytest.raises(ValueError, match='Unrecognized'):
        parse_dates('soon', TODAY)
