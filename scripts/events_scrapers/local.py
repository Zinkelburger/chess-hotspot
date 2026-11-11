from datetime import date, datetime, timedelta
import re
from urllib.parse import urljoin
from .base import BaseEventScraper, ScrapedEvent
from .details import cancellation_evidence
from .common import Client, text, source_ref, state_code, enrich, stable_id


def fields(soup):
    result = {}
    for row in soup.select('tr'):
        cells = row.find_all(['th', 'td'], recursive=False)
        if len(cells) == 2: result[text(cells[0]).rstrip(':')] = text(cells[1])
    return result


class HubScraper(BaseEventScraper):
    source_id = 'nachesshub'
    source_url = 'https://www.nachesshub.com/AllEvents'
    words_at_top = 'Read the complete paginated event table and official detail fields.'
    def __init__(self): self.client = Client()

    def parse_listing(self, soup):
        events = []
        for row in soup.select('table tbody tr'):
            cells = row.find_all('td', recursive=False)
            link = row.select_one('a[href*="/Events/Details/"]')
            if not link: continue
            # Organizers' test listings, and the platform's own "Sample - Quads" templates.
            if re.search(r'\btest\b|^\s*sample\b', text(link), re.I): continue
            if len(cells) != 14: raise ValueError('NA Chess Hub table columns changed')
            start = datetime.strptime(text(cells[0]), '%m/%d/%Y').date()
            days = int(text(cells[1]).split('-')[0])
            state = state_code(text(cells[2]))
            if not state: continue  # Canada and other non-US listings.
            url = urljoin(self.source_url, link['href'])
            rating = text(cells[5])
            event = ScrapedEvent(id=stable_id(self.source_id, url, start.isoformat()), name=text(link),
                date=start.isoformat(), endDate=(start + timedelta(days=days-1)).isoformat(),
                city=text(cells[3]), state=state, organizer=text(cells[10]),
                audience='scholastic' if text(cells[4]) == 'Scholastic' else None,
                rated=rating != 'UnRated', ratingSystem='USCF' if 'USCF' in rating else 'FIDE' if 'FIDE' in rating else None,
                format=text(cells[6]).lower() if text(cells[6]).lower() in {'blitz','rapid','classical'} else None,
                website=url, source=self.source_id, sources=[source_ref(self.source_id,url)])
            money = text(cells[12]).replace('$','').replace(',','')
            if money.isdigit(): event.prizeFundUsd = int(money)
            events.append(event)
        return events

    def scrape(self):
        events, seen, url = [], set(), self.source_url
        for _ in range(100):
            if url in seen: raise ValueError('NA Chess Hub pagination loop')
            seen.add(url); soup = self.client.soup(url)
            batch = self.parse_listing(soup)
            if not soup.select('table tbody a[href*="/Events/Details/"]'): raise ValueError('NA Chess Hub returned no event rows')
            events.extend(batch)
            next_link = next((a for a in soup.select('a[href]') if text(a) == 'Next' and 'disabled' not in a.get('class', [])), None)
            if not next_link: break
            url = urljoin(self.source_url, next_link['href'])
        else: raise ValueError('NA Chess Hub page limit reached')
        events = list({e.id:e for e in events}.values())
        for event in events:
            if (event.endDate or event.date) < (date.today()-timedelta(days=1)).isoformat(): continue
            self.detail(event, self.client.soup(event.website))
        return events

    def detail(self, event, soup):
        info = fields(soup)
        if not info.get('Name') or not info.get('Dates'):
            raise ValueError('NA Chess Hub detail page missing event fields (possible soft 404 or layout change)')
        event.address = info.get('Event Address')
        event.online = 'online' in info.get('Format', '').lower()
        enrich(event, info.get('Time Control', ''))
        event.cancellationEvidence = cancellation_evidence(info['Name'], '')
        fee_parts = []
        for label, value in info.items():
            if re.match(r'^\d+\.', label) and 'Entry Fees' in value:
                fee_parts.append(label + ': ' + value.split('Entry Fees', 1)[1].strip())
        event.entryFeeText = '\n'.join(fee_parts) or info.get('Entry Fee') or info.get('Entry Fees')
        event.scheduleText = info.get('Round Times') or info.get('Schedule') or info.get('Dates')
        occurrences = next((v for k, v in info.items() if k.startswith('Occurrences')), None)
        if occurrences: event.scheduleText += '\nOccurrences: ' + occurrences
        event.registrationText = info.get('Registration Deadline') or info.get('Registration')
        rating = info.get('Rating Type')
        if rating:
            event.rated = rating.lower() != 'unrated'
            event.fideRated = 'FIDE' in rating
        return event


class BoylstonScraper(BaseEventScraper):
    source_id = 'boylston'
    source_url = 'https://boylstonchess.org/events'
    words_at_top = 'Use the structured upcoming event list behind Boylston’s calendar.'
    def __init__(self): self.client = Client()

    def parse(self, soup, today=None):
        today = today or date.today()
        events = []
        for panel in soup.select('.panel.event'):
            link = panel.select_one('.title a[href]'); info = fields(panel)
            if not link or 'Date' not in info: raise ValueError('Boylston event fields changed')
            name, raw = text(link), info['Date']
            if re.search(r'membership|team signup|(?:board|annual) meeting', name, re.I): continue
            match = re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(.*)', raw)
            if not match: raise ValueError(f'Unrecognized Boylston date: {raw}')
            month = datetime.strptime(match[1], '%B').month
            year_match = re.search(r'\b20\d{2}\b', raw)
            year = int(year_match[0]) if year_match else today.year + (1 if month < today.month-6 else 0)
            days = [int(match[2])] + [int(n) for n in re.findall(r'\b\d{1,2}\b', re.sub(r'\b20\d{2}\b','',match[3]))]
            start, end = date(year,month,min(days)).isoformat(), date(year,month,max(days)).isoformat()
            url = urljoin(self.source_url,link['href'])
            online = bool(re.search(r'\bonline\b', name, re.I))
            event = ScrapedEvent(id=stable_id(self.source_id,url,start),name=name,date=start,endDate=end,dateText=raw,
                type='lesson' if re.search(r'lesson|class',name,re.I) else 'meetup' if re.search(r'club night|book talk|social',name,re.I) else 'tournament',
                city=None if online else 'Boston',state=None if online else 'MA', online=online,
                venue=None if online else 'Boylston Chess Foundation', organizer='Boylston Chess Foundation',
                address=None if online else '35 Kingston St, Unit 1, Boston, MA 02111',
                website=url, source=self.source_id, sources=[source_ref(self.source_id,url)],
                entryFeeText=info.get('Entry Fee'), notes=info.get('Round Times'))
            enrich(event, ' '.join(info.values()))
            # Fee text contains conditional discounts and late surcharges; do not infer a numeric minimum.
            events.append(event)
        if not events: raise ValueError('Boylston returned no events')
        return events

    def scrape(self): return self.parse(self.client.soup(self.source_url))


class MACAScraper(BaseEventScraper):
    source_id = 'maca'
    source_url = 'https://www.masschess.org/Events/Chess_Tournaments.aspx'
    words_at_top = 'Read the MACA tournament directory; fail visibly if unavailable or changed.'
    def __init__(self): self.client = Client()

    def scrape(self):
        # MACA currently refuses connections. Do not fabricate events or silently
        # substitute a staging site. Wire its parser after the live markup is verified.
        self.client.soup(self.source_url)
        raise ValueError('MACA requires live markup verification before enabling its parser; MACA registrations are also covered by NA Chess Hub.')
