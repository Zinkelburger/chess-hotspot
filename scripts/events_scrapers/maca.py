"""Massachusetts Chess Association: its future-events sheet, then each event's page.

MACA publishes the list as a Google Sheet embedded in its site. Its own pages
answer only over plain HTTP; HTTPS connections are reset by the server.
"""
from datetime import date, datetime, timedelta
import re
from urllib.parse import parse_qs, urlparse
from bs4 import BeautifulSoup
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, enrich, source_ref, stable_id, state_code
from .details import excerpt

SHEET = ('https://docs.google.com/spreadsheets/d/e/2PACX-1vTHJk005-lWyaJmwA6MYoNraICOzD0-rC7j96zNM0tknECXN1NWf9YnfI-y69sY0sohnB5e7lI55CYD'
         '/pubhtml?gid=1341448674&single=true&widget=false&chrome=false&headers=false')
NOT_A_TOURNAMENT = re.compile(r'chess chat|new chess club|\bprogram\b|\bcamp\b|\blessons?\b|\bclass(?:es)?\b|\bworkshop\b|\blecture\b|\bsimul\b|beers\s*&\s*boards|\bround\s+\d+\b', re.I)
LABELS = ('Event Organizer:', 'Event Location:', 'Event Date:', 'Time Control:', 'Rounds Time:', 'Byes:', 'Prize Info:',
          'Inquiry:', 'Entry Fee:', 'Registration - Onsite:', 'Registration - Advance:', 'Registration Information',
          'Sections Information', 'Tournament Sections:', 'Tournament Rules and Other Information')


def unwrap(href):
    """The sheet routes links through google.com/url?q=<target>."""
    parsed = urlparse(href)
    if parsed.netloc.endswith('google.com') and parsed.path == '/url':
        return parse_qs(parsed.query)['q'][0]
    return href


def parse_sheet(soup):
    rows = []
    for row in soup.select('table tr'):
        cells = row.find_all('td', recursive=False)
        if len(cells) != 5 or cells[1].get_text(strip=True) == 'Date':
            continue
        when = cells[1].get_text(strip=True)
        if not when:
            continue
        link = cells[3].find('a', href=True)
        rows.append({'date': datetime.strptime(when.split(', ', 1)[1], '%m/%d/%y').date(), 'organizer': cells[2].get_text(' ', strip=True),
                     'name': cells[3].get_text(' ', strip=True), 'location': cells[4].get_text(' ', strip=True),
                     'url': unwrap(link['href']) if link else None, 'scholastic': '✅' in cells[0].get_text()})
    if not rows:
        raise ValueError('MACA sheet changed: no event rows found')
    return rows


def parse_place(location):
    match = re.match(r'^\s*(.*?)\s*,\s*([A-Z]{2})\s*$', location)
    return (match[1] or None, state_code(match[2])) if match else (None, None)


def page_fields(soup):
    copy = BeautifulSoup(str(soup), 'html.parser')
    for node in copy(['script', 'style', 'noscript']):
        node.decompose()
    lines = [cleaned for line in copy.get_text('\n').splitlines() if (cleaned := re.sub(r'\s+', ' ', line).strip())]
    fields, label = {}, None
    for line in lines:
        if line in LABELS:
            label = line.rstrip(':')
            fields[label] = []
        elif label:
            fields[label].append(line)
    return fields


class MACAScraper(BaseEventScraper):
    source_id = 'maca'
    source_url = 'http://www.masschess.org/Events/chess-event-list.aspx'
    words_at_top = "Read MACA's future-events sheet, then each event's page."

    def __init__(self):
        self.client = Client()
        self.sheet_client = Client(delay=1)  # docs.google.com asks for Crawl-delay: 1.

    def group(self, rows):
        """A multi-date event appears once per date, sharing its detail link."""
        groups = {}
        for row in rows:
            if NOT_A_TOURNAMENT.search(row['name']):
                continue
            # Several future MACA events share one announcement page until scheduled.
            key = row['url'] if row['url'] and 'Event_ID' in row['url'] else (row['url'], row['name'], row['date'])
            groups.setdefault(key, []).append(row)
        return list(groups.values())

    def build(self, rows, soup=None):
        first = rows[0]
        city, state = parse_place(first['location'])
        if first['url'] and 'Event_ID' in first['url']:
            url = first['url']
        else:
            slug = re.sub(r'[^a-z0-9]+', '-', first['name'].lower()).strip('-')
            url = f"{first['url'] or self.source_url}#{slug}"
        dates = [row['date'] for row in rows]
        fields = page_fields(soup) if soup is not None else {}
        if soup is not None and 'Event Date' not in fields:
            raise ValueError('MACA detail page missing event fields (possible soft 404 or layout change)')
        listed = [datetime.strptime(line, '%A, %B %d, %Y').date() for line in fields.get('Event Date', []) if re.match(r'^[A-Z][a-z]+day, ', line)]
        dates = sorted(set(listed or dates))
        start = dates[0].isoformat()
        event = ScrapedEvent(id=stable_id(self.source_id, url, start), name=first['name'].lstrip('✅ ').strip(), date=start,
            endDate=dates[-1].isoformat(), city=city, state=state, online=False, organizer=' '.join(fields.get('Event Organizer', [])[:1]) or first['organizer'],
            website=url, source=self.source_id, sources=[source_ref(self.source_id, url)],
            audience='scholastic' if first['scholastic'] else None)
        location = fields.get('Event Location', [])
        location = [part.lstrip(', ').strip() for part in location if part != '[' and part != ']' and part != 'Directions']
        if len(location) >= 3:
            event.venue = location[0]
            event.address = re.sub(r'\s+,', ',', ', '.join(location[1:-1]) + ' ' + location[-1]).strip()
        control = ' '.join(fields.get('Time Control', []))
        enrich(event, control)
        # A club's regular meeting night is listed alongside rated events; only a time control tells them apart.
        if re.search(r'chess club', event.name, re.I) and not event.timeControl:
            return None
        if re.search(r'\bonline\b', event.name, re.I):
            event.online, event.city, event.state, event.venue, event.address = True, None, None, None, None
        event.sections = None
        event.entryFeeText = excerpt(' '.join(fields.get('Entry Fee', []))) if fields.get('Entry Fee') else None
        event.scheduleText = excerpt(' '.join(fields.get('Rounds Time', []))) if fields.get('Rounds Time') else None
        registration = fields.get('Registration - Advance', []) + fields.get('Registration - Onsite', [])
        event.registrationText = excerpt(' '.join(registration)) if registration else None
        if len(dates) > 1:
            listing = ', '.join(d.strftime('%b %-d') for d in dates)
            event.scheduleText = (event.scheduleText + '\n' if event.scheduleText else '') + 'Dates: ' + listing
        return event

    def scrape(self):
        rows = parse_sheet(self.sheet_client.soup(SHEET))
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        events = []
        for group in self.group(rows):
            url = group[0]['url']
            soup = self.client.soup(url) if url and 'Event_ID' in url else None
            event = self.build(group, soup)
            if event and (event.endDate or event.date) >= cutoff:
                events.append(event)
        return events
