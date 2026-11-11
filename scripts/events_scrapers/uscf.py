from urllib.parse import urljoin
from datetime import date, datetime, timedelta
import re
import requests
from .details import attendance_details, section_details
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, text, state_code, source_ref, enrich, stable_id, registration_url

class USCFScraper(BaseEventScraper):
    source_id = 'uscf'
    source_url = 'https://new.uschess.org/upcoming-tournaments'
    words_at_top = 'Follow every results page, then read structured tournament detail fields.'

    def __init__(self):
        self.client = Client()
        self.warnings = []
        self.withdrawn = []

    def parse_listing(self, soup):
        events = []
        for row in soup.select('.event-details'):
            link = row.select_one('h3 a[href]')
            dates = row.select('time[datetime]')
            if not link or not dates:
                raise ValueError('US Chess listing changed: missing title or date')
            url = urljoin(self.source_url, link['href'])
            location = text(row.select_one('.address')).rsplit(',', 1)
            date = dates[0]['datetime'][:10]
            event = ScrapedEvent(id=stable_id(self.source_id, url, date), name=text(link), date=date,
                endDate=dates[-1]['datetime'][:10], city=location[0].strip(),
                state=state_code(location[-1].strip()), organizer=text(row.select_one('.organizer-name')),
                website=url, source='uscf', sources=[source_ref('uscf', url)], rated=True, ratingSystem='USCF',
                dateText=text(row.select_one('.dates')))
            events.append(event)
        return events

    def detail(self, event, soup):
        def field(name): return text(soup.select_one('.views-field-' + name + ' .field-content'))
        event.address = field('field-event-address') or None
        event.venue = field('field-event-location-name') or None
        event.city = text(soup.select_one('.locality')) or event.city
        event.state = state_code(text(soup.select_one('.administrative-area'))) or event.state
        country = text(soup.select_one('.country'))
        if country and country != 'United States': event.country = country
        online = field('field-online-event')
        event.online = online == 'Yes' if online else None
        fide = field('field-fide-rated')
        prize = field('field-total-overall-prize-fund').replace('$','').replace(',','')
        if prize.isdigit(): event.prizeFundUsd = int(prize)
        if not soup.select_one('.views-field-field-event-dates, .views-field-field-event-address'):
            raise ValueError('US Chess detail page missing event fields (possible soft 404 or layout change)')
        content = field('body')
        enrich(event, content)
        if fide in ('Yes', 'No'): event.fideRated = fide == 'Yes'
        attendance_details(event, soup.select_one('.views-field-body .field-content'))
        event.sections = section_details(soup.select_one('.views-field-body .field-content'))
        event.registrationUrl = registration_url(soup.select_one('.views-field-body .field-content'))
        return event

    def retain_unexpired(self, events, previous):
        """The upcoming index drops started events. Recheck known detail URLs
        before dropping an unexpired occurrence, including current recurring dates.
        """
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        current = {e.id for e in events}
        self.withdrawn = []
        for old in previous:
            if old.id in current or (old.endDate or old.date) < cutoff:
                continue
            # An updated series window already covers this old occurrence.
            if any(e.website == old.website and e.date <= old.date and (e.endDate or e.date) >= (old.endDate or old.date) for e in events):
                continue
            try:
                soup = self.client.soup(old.website)
            except requests.HTTPError as exc:
                # US Chess removed the page: the listing was withdrawn, so there
                # is nothing left to keep. Any other failure still stops the refresh.
                if exc.response is not None and exc.response.status_code in (404, 410):
                    self.withdrawn.append(old.website)
                    continue
                raise
            times = soup.select('.views-field-field-event-dates time[datetime]')
            recurring = soup.select_one('.views-field-field-event-dates .date-recur-interpretaton')
            if times:
                start, end = times[0]['datetime'][:10], times[-1]['datetime'][:10]
            elif recurring:
                start, end = old.date, old.endDate or old.date
                until = re.search(r'until (?:\w+,? )?(\w+ \d{1,2}, \d{4})', text(recurring), re.I)
                if until:
                    end = min(end, datetime.strptime(until[1], '%B %d, %Y').date().isoformat())
            else:
                raise ValueError(f'Cannot verify dates for missing unexpired listing: {old.website}')
            if end < cutoff or end < start:
                continue
            event_id = stable_id(self.source_id, old.website, start)
            if event_id in current:
                continue
            event = ScrapedEvent(id=event_id, name=text(soup.select_one('h1')) or old.name,
                date=start, endDate=end, dateText=old.dateText if start == old.date else None,
                city=old.city, state=old.state, organizer=old.organizer,
                website=old.website, source=self.source_id,
                sources=[source_ref(self.source_id, old.website)], rated=True, ratingSystem='USCF')
            self.detail(event, soup)
            event.reviewFlags = sorted(set((event.reviewFlags or []) + ['unexpired-listing-rechecked']))
            events.append(event); current.add(event.id)
        if self.withdrawn:
            print(f'[uscf] {len(self.withdrawn)} earlier listings were removed by US Chess and dropped: ' + ', '.join(sorted(set(self.withdrawn))[:5]), flush=True)
        return events

    def scrape(self):
        self.warnings = []
        url, seen, events = self.source_url, set(), []
        for _ in range(150):
            if url in seen: raise ValueError('US Chess pagination loop')
            seen.add(url)
            soup = self.client.soup(url)
            page = self.parse_listing(soup)
            if not page: raise ValueError('US Chess returned no listing rows')
            events.extend(page)
            print(f'[uscf] page {len(seen)}: {len(page)} listings', flush=True)
            link = soup.select_one('.pager a[rel="next"]')
            if not link: break
            url = urljoin(self.source_url, link['href'])
        else: raise ValueError('US Chess pagination limit reached')
        unique = {e.id: e for e in events}
        for i, event in enumerate(unique.values()):
            try: self.detail(event, self.client.soup(event.website))
            except Exception as exc: self.warnings.append(f'{event.website}: {exc}')
            if (i+1) % 50 == 0: print(f'[uscf] details {i+1}/{len(unique)}', flush=True)
        if self.warnings: raise ValueError(f'{len(self.warnings)} detail pages failed; first: {self.warnings[0]}')
        return [e for e in unique.values() if e.country == 'US']
