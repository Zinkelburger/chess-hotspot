from dataclasses import replace
from datetime import date
from pathlib import Path
import pytest
from bs4 import BeautifulSoup
from events_scrapers.base import ScrapedEvent
from events_scrapers.common import enrich, stable_id
from events_scrapers.uscf import USCFScraper
from events_scrapers.local import BoylstonScraper, HubScraper
from scrape_events import deduplicate, refresh_source, validate

FIXTURES=Path(__file__).parent/'fixtures'
def soup(name):return BeautifulSoup((FIXTURES/name).read_text(),'html.parser')
def event(**kwargs):return ScrapedEvent(id='test',name='October Open',date='2026-10-03',website='https://example.org/event',**kwargs)

def test_uscf_uses_current_occurrence_not_original_series_start():
    scraper=USCFScraper()
    e=scraper.parse_listing(soup('uscf-listing.html'))[0]
    scraper.detail(e,soup('uscf-detail.html'))
    assert e.date=='2026-10-06'
    assert e.state=='NC' and e.city=='Charlotte'
    assert '28226' in e.address
    assert e.online is False and e.fideRated
    assert e.ratingSystem=='USCF'
    assert e.timeControl['kind']=='custom'
    assert [tc['baseMinutes'] for tc in e.timeControls]==[80,60,45]
    assert all(tc['incrementSeconds']==10 for tc in e.timeControls)

def test_hub_columns_and_multiday_end():
    events=HubScraper().parse_listing(soup('hub-listing.html'))
    assert len(events)==1  # The second row is an organizer test event.
    assert events[0].date=='2026-09-02'
    assert events[0].endDate=='2026-09-30'
    assert events[0].state=='MA' and events[0].ratingSystem=='USCF'
    assert events[0].website.startswith('https://www.nachesshub.com/Events/Details/')

def test_hub_platform_sample_listings_are_excluded():
    page=soup('hub-listing.html')
    # The platform publishes "Sample - Quads" style templates dated years ahead.
    page.select_one('table tbody tr a[href*="/Events/Details/"]').string='Sample - Quads'
    assert HubScraper().parse_listing(page)==[]

def test_boylston_yearless_series_unrated_and_non_event_exclusions():
    events=BoylstonScraper().parse(soup('boylston-events.html'),date(2026,10,2))
    e=next(e for e in events if e.name=='November Tuesday Night Swiss (OTB)')
    assert (e.date,e.endDate)==('2026-11-03','2026-11-24')
    e=next(e for e in events if e.name=='Unrated Friday Night Blitz')
    assert e.rated is False and e.ratingSystem=='none'
    assert not any('Meeting' in e.name or 'Membership' in e.name for e in events)
    assert next(e for e in events if e.name=='Sunday Scholastic Lessons').type=='lesson'

def test_unrated_players_does_not_mean_unrated_event():
    e=enrich(event(),'USCF membership required. Unrated players welcome.')
    assert e.rated is True

def test_dedup_keeps_source_links_and_distinct_dates_and_cities():
    a=event(city='Boston',state='MA',source='uscf',sources=[{'id':'uscf','url':'https://example.org/event'}])
    b=replace(a,id='b',source='boylston',website='https://boylstonchess.org/events/1',sources=[{'id':'boylston','url':'https://boylstonchess.org/events/1'}],venue='Boylston')
    c=replace(b,id='c',date='2026-10-10')
    d=replace(b,id='d',city='Cambridge',website='https://example.org/2')
    result=deduplicate([a,b,c,d])
    assert len(result)==3 and len(result[0].sources)==2
    assert result[0].venue=='Boylston'
    assert result[0].id=='test'

def test_generic_names_without_city_are_not_merged():
    assert len(deduplicate([event(),replace(event(),id='b',website='https://example.org/other')]))==2

def test_validation_rejects_bad_dates_duplicate_ids_and_coordinates():
    for batch in [[replace(event(),endDate='2026-01-01')],[event(),event()],[event(lat=42)],[event(lat=999,lng=1)]]:
        with pytest.raises(ValueError):validate(batch)

def test_empty_or_truncated_refresh_keeps_previous_data():
    class Source:
        def scrape(self):return []
    previous=[event()]
    with pytest.raises(ValueError,match='Empty'):refresh_source(Source(),previous)
    assert previous[0].id=='test'
    class Truncated:
        def scrape(self):return [event()]
    with pytest.raises(ValueError,match='Count dropped'):refresh_source(Truncated(),[replace(event(),id=str(i)) for i in range(5)])

def test_source_errors_propagate_for_runner_fallback():
    class Source:
        def scrape(self):raise ConnectionError('offline')
    with pytest.raises(ConnectionError):refresh_source(Source(),[event()])

def test_stable_id_depends_on_source_url_and_occurrence():
    assert stable_id('uscf','https://example.org/1','2026-10-03')==stable_id('uscf','https://example.org/1','2026-10-03')
    assert stable_id('uscf','https://example.org/1','2026-10-03')!=stable_id('uscf','https://example.org/1','2026-10-10')

def test_all_uscf_listing_pages_are_followed_before_details(monkeypatch):
    scraper=USCFScraper();calls=[]
    first=soup('uscf-listing.html');second=soup('uscf-listing.html');second.select_one('.pager').decompose()
    second.select_one('h3 a')['href']='/second-event'
    def fetch(url):
        calls.append(url)
        if url==scraper.source_url:return first
        if '?page=1' in url:return second
        return soup('uscf-detail.html')
    monkeypatch.setattr(scraper.client,'soup',fetch)
    events=scraper.scrape()
    assert len(events)==2 and '?page=1' in calls[1]


@pytest.mark.parametrize("slug, expected",[("ecc26","EASTERN CLASS"),("eo26","EASTERN OPEN"),("mwcc26","MIDWEST CLASS"),("nao26","NORTH AMERICAN OPEN")])
def test_current_cca_titles_and_addresses(slug,expected):
    from events_scrapers.cca import CCAScraper
    scraper=CCAScraper()
    content=scraper._extract_text((FIXTURES/(slug+'.htm')).read_text())
    assert expected in scraper._pick_name(scraper._lines(content)).upper()
    assert scraper._extract_address(content)


def test_postal_geocoder_uses_zip_not_street_number(tmp_path):
    from events_scrapers.geocode import Geocoder
    coder=Geocoder()
    coder.cache={}
    coder.rows=[['US','98005','Bellevue','Washington','WA','','','','','47.61','-122.16']]
    e=event(city='Bellevue',state='WA',address='13620 NE 20th St, Bellevue, WA, USA, 98005')
    coder.resolve(e)
    assert e.lat==47.61 and e.lng==-122.16 and e.locationPrecision=='postal'


def test_mixed_rated_and_unrated_sections_are_still_rated():
    e=event(rated=True,ratingSystem='USCF')
    e.name='Tri-Cities Dual Rated Tournament (Rated & Unrated)'
    enrich(e,'USCF membership required for rated sections')
    assert e.rated is True and e.ratingSystem=='USCF'


def test_multiple_schedules_keep_both_controls():
    from events_scrapers.common import parse_time_control
    tc=parse_time_control('Premier: 40/80, SD/30; d30. Three-day option rounds 1-3 G/30 d10.')
    assert tc['kind']=='custom'
    assert 'G/30' in tc['raw']
    assert 'SD/30' in tc['raw']


def test_first_main_control_wins_over_later_promotion():
    from events_scrapers.common import parse_time_control
    assert parse_time_control('Blitz G/5 +2. Also enter our Open 40/80, SD/30; d30.')['kind']=='blitz'


def test_charlotte_real_page_retains_schedules_fees_and_registration():
    e=event()
    USCFScraper().detail(e,soup('2026-charlotte-fall-open.html'))
    assert e.format=='custom'
    assert {tc['baseMinutes'] for tc in e.timeControls}=={30,110}
    assert '$135 by September 16' in e.entryFeeText
    assert '$150 after' in e.entryFeeText
    assert 'GM/IM/WGMs' in e.entryFeeText  # Keep conditions, not an invented free-entry minimum.
    assert e.entryFeeUsdMin is None
    assert 'Friday: 6:30pm' in e.scheduleText and '2-Day Schedule' in e.scheduleText
    assert '90 minutes before round 1' in e.registrationText
    assert '$134 per night' not in e.entryFeeText


def test_legacy_hours_control_and_side_event_do_not_become_blitz():
    e=event()
    USCFScraper().detail(e,soup('43rd-annual-reno-western-states-open.html'))
    assert e.format=='custom'
    assert '40/2' in e.timeControl['raw']
    assert all(tc['kind'] != 'blitz' for tc in e.timeControls)
    assert 'multiple-or-ambiguous-time-controls' in e.reviewFlags
    assert e.entryFeeText is None
    assert 'section-specific-fees-need-review' in e.reviewFlags


def test_fractional_minutes_not_truncated():
    from events_scrapers.common import parse_time_control
    assert parse_time_control('G/3.5 +2')['baseMinutes']==3.5


def test_soft_404_detail_fails_instead_of_erasing_metadata():
    with pytest.raises(ValueError, match='missing event fields'):
        USCFScraper().detail(event(),BeautifulSoup('<h1>Page not found</h1>', 'html.parser'))


def test_cancellation_notice_is_distinct_from_policy():
    from events_scrapers.details import cancellation_evidence
    assert cancellation_evidence('October Open','This tournament has been cancelled due to weather.')
    assert cancellation_evidence('POSTPONED October Open','See organizer.')
    assert not cancellation_evidence('October Open','Cancellation policy: if the event is cancelled, refunds apply.')


def test_quality_report_counts_coverage_and_blocks_stale_sources():
    from datetime import datetime, timezone
    from event_quality import review_report
    now=datetime(2026,10,3,tzinfo=timezone.utc)
    report=review_report([event(entryFeeText='$40',scheduleText='Round 1: 10am'),replace(event(),id='cancel',cancellationEvidence='Cancelled')],
                         [{'id':'uscf','status':'ok','lastSuccess':'2026-09-01T00:00:00Z'}],now)
    assert report['passed'] is False
    assert report['coverage']['events']==1 and report['coverage']['withFees']==1
    assert report['issueCounts']['source-stale']==1
    assert report['issueCounts']['cancelled-or-postponed-excluded']==1


def test_dedup_reports_conflicting_schedule_fields():
    a=event(city='Boston',state='MA',format='classical')
    b=replace(a,id='b',format='rapid')
    result=deduplicate([a,b])
    assert 'source-conflict-format' in result[0].reviewFlags


def test_semantic_validation_rejects_contradictory_format_and_fees():
    with pytest.raises(ValueError, match='Conflicting format'):
        validate([event(format='blitz',timeControl={'kind':'classical','baseMinutes':90})])
    with pytest.raises(ValueError, match='fee range'):
        validate([event(entryFeeUsdMin=80,entryFeeUsdMax=20)])


def test_refresh_excludes_cancellations_and_retains_snapshot_on_failure(tmp_path,monkeypatch):
    import json,sys
    import scrape_events
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys,'argv',['scrape_events.py','--no-geocode','--strict'])
    class Source:
        source_url='https://example.org/events'
        words_at_top='test source'
        fail=False
        def scrape(self):
            if self.fail: raise ConnectionError('Source unavailable')
            return [replace(event(),date=date.today().isoformat()),replace(event(),id='cancelled',date=date.today().isoformat(),website='https://example.org/cancelled',cancellationEvidence='This tournament is cancelled.')]
    monkeypatch.setattr(scrape_events,'REGISTRY',{'uscf':('US Chess',Source)})
    scrape_events.main()
    assert len(json.loads((tmp_path/'public/events.v1.json').read_text()))==1
    assert len(json.loads((tmp_path/'data/event-sources/uscf.json').read_text()))==2
    report=json.loads((tmp_path/'public/events-review.json').read_text())
    assert report['issueCounts']['cancelled-or-postponed-excluded']==1
    before=(tmp_path/'public/events.v1.json').read_text()
    Source.fail=True
    with pytest.raises(SystemExit):scrape_events.main()
    assert (tmp_path/'public/events.v1.json').read_text()==before
    status=json.loads((tmp_path/'public/events-status.json').read_text())
    assert status['sources'][0]['status']=='error' and status['sources'][0]['lastSuccess']
    assert status['quality']['passed'] is False


def test_hub_detail_preserves_section_prices_and_exact_deadline():
    e=event()
    content=BeautifulSoup('''<table>
      <tr><td>Name</td><td>October Open</td></tr>
      <tr><td>Dates</td><td>October 3, 2026 9:00 AM ~ October 4, 2026 6:00 PM</td></tr>
      <tr><td>Entry Fee</td><td>Due on registration</td></tr>
      <tr><td>Registration Deadline</td><td>October 3, 2026 8:30 AM</td></tr>
      <tr><td>1. Open</td><td>5 Rounds | USCF Rated Entry Fees (USD) $80.00 [Adults]</td></tr>
      <tr><td>2. Scholastic</td><td>5 Rounds | USCF Rated Entry Fees (USD) $40.00 [K-12]</td></tr>
    </table>''','html.parser')
    HubScraper().detail(e,content)
    assert 'Open: (USD) $80.00 [Adults]' in e.entryFeeText
    assert 'Scholastic: (USD) $40.00 [K-12]' in e.entryFeeText
    assert e.registrationText=='October 3, 2026 8:30 AM'
    assert '9:00 AM' in e.scheduleText
    assert e.entryFeeUsdMin is None
    with pytest.raises(ValueError,match='missing event fields'):
        HubScraper().detail(e,BeautifulSoup('<h1>Not found</h1>','html.parser'))


def test_one_schedule_is_compatible_with_a_source_listing_multiple_schedules():
    a=event(city='Boston',state='MA',format='custom',timeControl={'kind':'custom','raw':'G/30 / G/110'},timeControls=[{'kind':'rapid','baseMinutes':30},{'kind':'classical','baseMinutes':110}])
    b=replace(a,id='b',format='classical',timeControl={'kind':'classical','baseMinutes':110},timeControls=None)
    result=deduplicate([a,b])
    validate(result)
    assert 'source-conflict-format' not in result[0].reviewFlags
    assert 'source-format-coverage-differs' in result[0].reviewFlags


def test_conflicting_source_cannot_fill_in_an_incompatible_time_control():
    a=event(city='Boston',state='MA',format='classical')
    b=replace(a,id='b',format='rapid',timeControl={'kind':'rapid','baseMinutes':25})
    result=deduplicate([a,b])
    validate(result)
    assert result[0].timeControl is None
    assert 'source-conflict-format' in result[0].reviewFlags


def test_structured_fide_flag_wins_over_side_event_mention():
    detail=soup('uscf-detail.html')
    detail.select_one('.views-field-field-fide-rated .field-content').string='No'
    e=event()
    USCFScraper().detail(e,detail)
    assert e.fideRated is False


def test_verified_venue_can_be_shared_across_sources_but_not_by_zip_alone():
    from events_scrapers.geocode import Geocoder
    coder=Geocoder()
    coder.spots=[{'id':'boylston_chess_club','address':'35 Kingston St, Boston, MA 02111','lat':42.35,'lng':-71.06}]
    e=event(source='uscf',venue='Boylston Chess Foundation',city='Boston',state='MA',address='35 Kingston Street, Unit 1, Boston, MA 02111',lat=42,lng=-71,locationPrecision='postal')
    coder.resolve(e)
    assert (e.lat,e.lng,e.locationPrecision)==(42.35,-71.06,'venue')
    wrong=replace(e,address='50 Kingston Street, Boston, MA 02111',lat=42,lng=-71,locationPrecision='postal',hostClubId=None)
    coder.resolve(wrong)
    assert wrong.locationPrecision=='postal' and wrong.hostClubId is None


def test_started_tournament_retained_only_after_detail_dates_rechecked(monkeypatch):
    from datetime import timedelta
    scraper=USCFScraper()
    start=(date.today()-timedelta(days=1)).isoformat()
    end=(date.today()+timedelta(days=1)).isoformat()
    old=replace(event(),date=start,endDate=end)
    page=soup('2026-charlotte-fall-open.html')
    dates=BeautifulSoup(f'<div class="views-field-field-event-dates"><time datetime="{start}T12:00:00Z"></time><time datetime="{end}T12:00:00Z"></time></div>','html.parser')
    page.append(dates)
    monkeypatch.setattr(scraper.client,'soup',lambda url:page)
    retained=scraper.retain_unexpired([], [old])
    assert len(retained)==1 and retained[0].endDate==end
    assert 'unexpired-listing-rechecked' in retained[0].reviewFlags
    assert retained[0].entryFeeText and retained[0].format=='custom'
    assert scraper.retain_unexpired(retained,[old])==retained


def test_ended_recurring_series_is_not_retained(monkeypatch):
    from datetime import timedelta
    scraper=USCFScraper()
    yesterday=(date.today()-timedelta(days=2)).strftime('%A, %B %d, %Y')
    page=BeautifulSoup(f'<div class="views-field-field-event-dates"><div class="date-recur-interpretaton">weekly on Friday, until {yesterday}</div></div>','html.parser')
    monkeypatch.setattr(scraper.client,'soup',lambda url:page)
    old=replace(event(),date=date.today().isoformat(),endDate=(date.today()+timedelta(days=5)).isoformat())
    assert scraper.retain_unexpired([], [old])==[]


def test_sections_do_not_include_eligibility_mentions_or_prize_classes():
    e=event()
    USCFScraper().detail(e,soup('uscf-detail.html'))
    assert [s['name'] for s in e.sections]==['TOP','Under 1600','Under 1300']
    assert e.sections[0]['minRating']==1600
    USCFScraper().detail(e,soup('2026-charlotte-fall-open.html'))
    assert [s['name'] for s in e.sections]==['Championship','Under 2000','Under 1600']


def test_listing_removed_by_us_chess_is_dropped_without_failing_the_refresh(monkeypatch):
    import requests
    from datetime import timedelta
    scraper=USCFScraper()
    end=(date.today()+timedelta(days=30)).isoformat()
    gone=replace(event(),date=date.today().isoformat(),endDate=end,website='https://new.uschess.org/withdrawn-ladder')
    def fetch(url,status=404):
        response=requests.Response(); response.status_code=fetch.status
        raise requests.HTTPError(f'{fetch.status} Client Error',response=response)
    fetch.status=404
    monkeypatch.setattr(scraper.client,'soup',fetch)
    assert scraper.retain_unexpired([], [gone])==[]
    assert scraper.withdrawn==[gone.website]
    # A server error says nothing about the listing, so the snapshot is kept.
    fetch.status=503
    with pytest.raises(requests.HTTPError):scraper.retain_unexpired([], [gone])
