"""King Registration: one public tournament list shared by many US organizers.

The list page embeds its data as JSON for its own filters, so listing fields need
no HTML parsing. Each event's page adds the venue line and the organizer's text.
Only /tournaments and /event/<slug> are read, never /register or entry lists.
"""
from datetime import date, timedelta
import json
import re
from urllib.parse import quote
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, enrich, source_ref, stable_id, state_code, text
from .details import attendance_details, body_lines, excerpt, section_details

BASE = 'https://www.kingregistration.com/'
# Listed on the platform but not over-the-board tournaments.
NOT_A_TOURNAMENT = re.compile(r'\bpostal\b|\biccf\b|\bwebserver\b|\bbundle\b|\bcamp\b|\blessons?\b|\bsimul\b|\bpuzzle\b', re.I)
PLACEHOLDER = re.compile(r'^\s*(?:test|sample)\b', re.I)
PROGRAM_NAME = re.compile(r'chess\s*club|fall\s*chess', re.I)
# Evidence that a listing called a club or program actually pairs games.
PLAY_FORMAT = re.compile(r'\bG\s*/\s*\d|\b\d\s*SS\b|\b\d+[- ]rounds?\b|\bswiss\b|\bquads?\b', re.I)
TOURNAMENT_NAME = re.compile(r'\b(?:rated|tournament|open|championships?|marathon)\b', re.I)
NEXT_TOPIC = re.compile(r'\s*(?:-{3,}|={3,}|(?:guaranteed\s+)?prizes?\b|byes?\b|contact\b|questions?\b|location\b|address\b|venue\b|where\b|sections?\b|format\b|time controls?\b|directions\b|parking\b|hotel\b|lodging\b|food\b|lunch\b|rules\b|equipment\b|eligibility\b|td\b|chief td\b|tournament director\b|organizer\b|online registration\s*:)', re.I)


def event_url(slug):
    return BASE + 'event/' + quote(slug, safe='')


def listing_events(html):
    match = re.search(r'<script id="tl-data" type="application/json">(.*?)</script>', html, re.S)
    if not match:
        raise ValueError('King Registration list changed: embedded event data not found')
    return json.loads(match[1])['events']


def is_tournament(name, description):
    # Organizers park internal listings far in the future ("fidemerge": "test, do not use").
    if PLACEHOLDER.search(name) or name.strip().lower() == 'fidemerge' or re.fullmatch(r'\s*test\b.{0,20}\bdo not use\W*', description, re.I | re.S):
        return False
    if NOT_A_TOURNAMENT.search(name):
        return False
    # After-school sign-ups and weekly club meetings use the same registration form.
    if re.search(r'after-?school|\bper class fee\b|\$\d+ per class\b', description, re.I) and not PLAY_FORMAT.search(description):
        return False
    return not (PROGRAM_NAME.search(name) and not TOURNAMENT_NAME.search(name) and not PLAY_FORMAT.search(description))


def own_topic(value):
    """Organizers write free-form pages, so a labelled block can run on into prizes and
    contact details. Keep the organizer's lines up to where the subject changes.
    """
    if not value:
        return None
    kept = []
    for line in value.splitlines():
        if NEXT_TOPIC.match(line) or re.search(r'\S@\S|\b\d{3}[-. )]+\d{3}[-. ]\d{4}\b|https?://', line):
            break
        kept.append(line)
    return excerpt('\n'.join(kept).strip())


def parse_location(soup):
    """Split the page's 'venue · street · City, ST ZIP' line. Any part may be absent."""
    icon = soup.select_one('i.bi-geo-alt')
    if icon is None:
        return None, None, None
    line = icon.parent
    for link in line.select('a'):
        link.decompose()
    parts = [part.strip() for part in text(line).split('·') if part.strip()]
    if not parts:
        return None, None, None
    place = re.match(r'^(.*?),\s*([A-Z]{2})(?:\s+(\d{5}))?(?:-\d{4})?$', parts[-1])
    if not place:
        return (parts[0], None, None)
    venue = parts[0] if len(parts) > 1 and not re.match(r'\d', parts[0]) else None
    street = next((part for part in parts[:-1] if part != venue), None)
    return venue, ', '.join(filter(None, [street, parts[-1]])), place[1].strip()


class KingRegistrationScraper(BaseEventScraper):
    source_id = 'kingregistration'
    source_url = BASE + 'tournaments'
    words_at_top = "Read King Registration's embedded event list, then each public event page."

    def __init__(self):
        self.client = Client()

    def parse_listing(self, html):
        events = []
        for item in listing_events(html):
            if item.get('countryname') != 'United States':
                continue
            url = event_url(item['event'])
            online = bool(item.get('online'))
            event = ScrapedEvent(id=stable_id(self.source_id, url, item['start']), name=item['name'].strip(),
                date=item['start'], endDate=item['end'], online=online,
                city=None if online else item.get('city') or None,
                state=None if online else state_code(item.get('state') or ''),
                venue=None if online else item.get('venue') or None,
                organizer=item.get('organizer') or None, fideRated=bool(item.get('fide')),
                audience='scholastic' if item.get('allscholastic') else None,
                website=url, source=self.source_id, sources=[source_ref(self.source_id, url)])
            event.entryFeeText = self.listed_fee(item)
            events.append(event)
        return events

    @staticmethod
    def listed_fee(item):
        """The platform's current online price. A zero can mean pay at the door, so it says nothing."""
        low, high = item.get('feemin'), item.get('feemax')
        if not low and not high:
            return None
        amount = f'${low}' if low == high else f'${low}–${high}'
        rises = f"; fee goes up after {item['feeup']}" if item.get('feeup') and item.get('feeup') != item.get('closes') else ''
        return f'{amount} online entry as listed on King Registration{rises}'

    def detail(self, event, soup):
        """Return False when the page shows the listing is not a tournament."""
        node = soup.select_one('#eventdescription')
        if node is None or not soup.select_one('h2'):
            raise ValueError('King Registration detail page missing event fields (possible soft 404 or layout change)')
        content = body_lines(node)
        if not is_tournament(event.name, content):
            return False
        if not event.online:
            venue, address, city = parse_location(soup)
            event.venue = event.venue or venue
            event.address = address
            event.city = event.city or city
        listed_fee = event.entryFeeText
        enrich(event, content)
        attendance_details(event, node)
        event.entryFeeText = own_topic(event.entryFeeText) or listed_fee
        event.scheduleText = own_topic(event.scheduleText)
        # The word "registration" also heads links to a roster, which say nothing about entering.
        event.registrationText = None if re.match(r'entry list\b', event.registrationText or '', re.I) else own_topic(event.registrationText)
        event.sections = section_details(node)
        return True

    def scrape(self):
        events = {e.id: e for e in self.parse_listing(self.client.get(self.source_url))}
        if not events:
            raise ValueError('King Registration returned no events')
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        kept = []
        for event in events.values():
            if (event.endDate or event.date) < cutoff:
                continue
            if self.detail(event, self.client.soup(event.website)):
                kept.append(event)
        return kept
