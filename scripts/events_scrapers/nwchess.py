"""Northwest Chess: the regional calendar for Washington, Oregon and Idaho.

Each line gives dates, a name, and usually a venue and city. Details are in linked
PDF flyers, which are not parsed, so this source supplies no fees or time controls.
"""
from datetime import date, timedelta
import re
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, source_ref, stable_id, state_code

MONTHS = {name: number for number, name in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(), 1)}
PERIOD = re.compile(r'^[A-Z][a-z]+(?:-[A-Z][a-z]+)?\s+(20\d{2})$')
WANTED_SECTIONS = {'Open/Club Events', 'Scholastic/Junior Events'}
OTHER_SECTIONS = {'US Chess National Scholastics'}
REGION = {'WA', 'OR', 'ID', 'MT', 'AK'}
LEADING_DATE = re.compile(r'^([A-Z][a-z]{2})\s+(\d{1,2}(?:\s*[-,]\s*\d{1,2})*)(?:\s*\([^)]*\))?\s+(.+)$')
PLACE = re.compile(r'(?:^|,)\s*([A-Z][A-Za-z. ]+?),?\s+([A-Z]{2})\b(?!.*,\s*[A-Z][A-Za-z. ]+?,?\s+[A-Z]{2}\b)')


def decode(html):
    """The page declares no charset and is written in Windows-1252."""
    return html.encode('latin-1', 'replace').decode('cp1252', 'replace')


def clean(value):
    return re.sub(r'\s+', ' ', value).strip()


def parse_days(month, days, year):
    numbers = [int(n) for n in re.findall(r'\d+', days)]
    listed = ',' in days
    dates = [date(year, MONTHS[month], n) for n in numbers]
    return dates[0], dates[-1], listed


def parse_line(item, year):
    """Return (name, href, start, end, rest, listed) or None when the line is not a dated event."""
    line = clean(item.get_text(' ', strip=True))
    match = LEADING_DATE.match(line)
    if not match or match[1] not in MONTHS:
        return None
    start, end, listed = parse_days(match[1], match[2], year)
    link = item.find('a', href=True)
    remainder = match[3]
    if link and remainder.startswith(clean(link.get_text(' ', strip=True))):
        name = clean(link.get_text(' ', strip=True))
        rest = remainder[len(name):].lstrip(' ,')
        href = link['href']
    else:
        name, _, rest = remainder.partition(',')
        href = None
    return clean(name), href, start, end, clean(rest), listed


class NWChessScraper(BaseEventScraper):
    source_id = 'nwchess'
    source_url = 'https://www.nwchess.com/calendar/index.htm'
    words_at_top = 'Read the Northwest Chess calendar of events.'

    def __init__(self):
        self.client = Client()

    def parse(self, soup):
        events, used, section, year = [], set(), None, None
        for node in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'li']):
            if node.name != 'li':
                heading = clean(node.get_text(' ', strip=True))
                period = PERIOD.match(heading)
                if period:
                    year = int(period[1])
                elif heading in WANTED_SECTIONS or heading in OTHER_SECTIONS:
                    section, year = heading, None
                continue
            if section not in WANTED_SECTIONS or year is None:
                continue
            parsed = parse_line(node, year)
            if parsed is None:
                continue
            name, href, start, end, rest, listed = parsed
            if re.search(r'British Columbia|, Canada\b', rest):
                continue
            place = PLACE.search(rest)
            state = state_code(place[2]) if place else None
            # The calendar also mentions national events, which their own listings cover better.
            if state and state not in REGION:
                continue
            city = place[1].strip() if place and state else None
            venue = rest[:place.start()].rsplit(',', 1)[-1].strip() if place and state else None
            slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            url = urljoin(self.source_url, href) if href else f'{self.source_url}#{slug}'
            if (url, start) in used:  # One flyer can advertise several events on a day.
                url = f'{url}#{slug}'
            used.add((url, start))
            event = ScrapedEvent(id=stable_id(self.source_id, url, start.isoformat()), name=name, date=start.isoformat(),
                endDate=end.isoformat(), city=city, state=state, venue=venue or None, online=False, website=url,
                source=self.source_id, sources=[source_ref(self.source_id, url)],
                audience='scholastic' if section.startswith('Scholastic') else None)
            if listed:
                event.scheduleText = clean(node.get_text(' ', strip=True)).split(name)[0].strip()
            events.append(event)
        if not events:
            raise ValueError('Northwest Chess calendar changed: no dated events found')
        return events

    def scrape(self):
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        soup = BeautifulSoup(decode(self.client.get(self.source_url)), 'html.parser')
        return [e for e in self.parse(soup) if (e.endDate or e.date) >= cutoff]
