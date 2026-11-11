"""Saint Louis Chess Club: event pages linked from its open-tournament pages.

robots.txt asks for ten seconds between requests. Recurring events show only their
next date, which is the one recorded; later occurrences are not expanded. The
club's scholastic page links only to a ticket seller, so those events are not read.
"""
from datetime import date, datetime, timedelta
import re
from bs4 import BeautifulSoup
import requests
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, enrich, source_ref, stable_id
from .details import excerpt

CATEGORY_PAGES = ['https://saintlouischessclub.org/events/weekly-open-chess-tournaments/', 'https://saintlouischessclub.org/events/major-open-club-tournaments/']
ADDRESS = '4663 Maryland Ave, St. Louis, MO 63108'
PLAY_FORMAT = re.compile(r'\bswiss\b|\bquads?\b|\bround robin\b|\brated games?\b|\bG\s*/\s*\d|\btournament\b', re.I)
MONTH = r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*'
ONE_DATE = re.compile(rf'^({MONTH})\.? (\d{{1,2}}), (20\d{{2}})$')
RANGE = re.compile(rf'^({MONTH})\.? (\d{{1,2}}), (20\d{{2}}) - ({MONTH})\.? (\d{{1,2}}), (20\d{{2}})$')


def to_date(month, day, year):
    return datetime.strptime(f'{month[:3]} {day} {year}', '%b %d %Y').date()


def page_lines(soup):
    copy = BeautifulSoup(str(soup), 'html.parser')
    for node in copy(['script', 'style', 'noscript', 'svg', 'nav', 'header', 'footer']):
        node.decompose()
    return [cleaned for line in copy.get_text('\n').splitlines() if (cleaned := re.sub(r'\s+', ' ', line).strip())]


def event_links(soup):
    """Links within the page body; the site menu also links to classes and broadcasts."""
    copy = BeautifulSoup(str(soup), 'html.parser')
    for node in copy.select('nav, header, footer'):
        node.decompose()
    return list(dict.fromkeys(a['href'] for a in copy.select('a[href]') if '/event/' in a['href']))


def after(lines, label):
    return lines[lines.index(label) + 1] if label in lines and lines.index(label) + 1 < len(lines) else None


class SaintLouisScraper(BaseEventScraper):
    source_id = 'stlouis'
    source_url = 'https://saintlouischessclub.org/events/events-we-offer/'
    words_at_top = 'Read Saint Louis Chess Club event pages, ten seconds apart as its robots.txt asks.'

    def __init__(self):
        self.client = Client(delay=10)

    def parse_page(self, url, soup):
        lines = page_lines(soup)
        # Finished events are replaced by a stub with no dates.
        if any('Online Registration is Closed' in line or 'already taken place' in line for line in lines[:8]):
            return None
        if 'Event Details' not in lines or '>' not in lines:
            raise ValueError('Saint Louis event page missing event fields (possible soft 404 or layout change)')
        crumb = lines.index('>')
        name, when = lines[crumb + 1], lines[crumb + 2]
        details = lines[lines.index('Event Details') + 1]
        ranged = RANGE.match(details)
        single = ONE_DATE.match(when)
        if ranged:
            start, end = to_date(ranged[1], ranged[2], ranged[3]), to_date(ranged[4], ranged[5], ranged[6])
        elif single:
            start = end = to_date(single[1], single[2], single[3])
        else:
            raise ValueError(f'Unrecognized Saint Louis date on {url}: {when}')
        cut = lines.index('Related Chess Events') if 'Related Chess Events' in lines else len(lines)
        body = lines[crumb:cut]
        content = ' '.join(body)
        if not PLAY_FORMAT.search(content):
            return None
        # Sentences ending in an e-mail link lose the address when the page is reduced to text.
        fee = re.sub(r'[;,]\s*contact\s*$', '', after(body, 'Entry Fee') or '') or next((f'{line} {body[i+1]}' for i, line in enumerate(body[:-1]) if line.startswith('Entry fee:') or line == 'Entry is'), None)
        register = after(body, 'Registration Closes') or next((f'{line} {body[i+1]} {body[i+2]}' for i, line in enumerate(body[:-2]) if line == 'Online registration closes'), None)
        event = ScrapedEvent(id=stable_id(self.source_id, url, start.isoformat()), name=name, date=start.isoformat(), endDate=end.isoformat(),
            city='St. Louis', state='MO', venue='Saint Louis Chess Club', address=ADDRESS, online=False,
            organizer='Saint Louis Chess Club', website=url, source=self.source_id, sources=[source_ref(self.source_id, url)],
            entryFeeText=excerpt(fee) if fee else None, scheduleText=after(body, 'Event Times'), registrationText=excerpt(register) if register else None,
            audience='scholastic' if re.search(r'scholastic', content[:400], re.I) else None)
        control = after(body, 'Time Control')
        enrich(event, control or content)
        event.sections = None
        return event

    def scrape(self):
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        urls = list(dict.fromkeys(url for page in CATEGORY_PAGES for url in event_links(self.client.soup(page))))
        if not urls:
            raise ValueError('Saint Louis category pages changed: no event links found')
        events = {}
        for url in urls:
            try:
                event = self.parse_page(url, self.client.soup(url))
            except (ValueError, requests.HTTPError) as exc:
                # Older pages move to ticket sellers and one-off sites; the count check below catches a real layout change.
                print(f'[stlouis] skipped {url}: {exc}', flush=True)
                continue
            if event and (event.endDate or event.date) >= cutoff:
                events[(event.name, event.date)] = event
        if not events:
            raise ValueError('Saint Louis returned no upcoming tournaments')
        return list(events.values())
