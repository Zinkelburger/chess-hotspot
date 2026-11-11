"""Mechanics' Institute Chess Club: its tournament list, then each tournament's page.

The list prints no year, so every date comes from the tournament's own page.
"""
from datetime import date, datetime, timedelta
import re
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, enrich, source_ref, stable_id, text
from .details import excerpt

ADDRESS = '57 Post Street, San Francisco, CA 94104'
INFO_LABELS = ('Date', 'Eligibility', 'Rating', 'Location', 'Capacity')


def parse_when(raw):
    """'Sun, Dec 13, 2026' or 'Sat, Nov 21 - Sun, Nov 22, 2026' or 'Sep 1, 2026 - May 30, 2027'."""
    parts = [part.strip() for part in re.split(r'\s+-\s+', re.sub(r'\s+,', ',', re.sub(r'\s+', ' ', raw)).strip())]
    found = [re.search(r'([A-Z][a-z]{2})\s+(\d{1,2})(?:,\s*(20\d{2}))?', part) for part in parts]
    if not all(found) or len(found) > 2 or not found[-1][3]:
        raise ValueError(f"Unrecognized Mechanics' date: {raw}")
    last_year = int(found[-1][3])
    def to_date(match, year):
        return datetime.strptime(f'{match[1]} {match[2]} {year}', '%b %d %Y').date()
    end = to_date(found[-1], last_year)
    if len(found) == 1:
        return end, end
    start = to_date(found[0], int(found[0][3] or last_year))
    if start > end:  # A range across New Year prints only the final year.
        start = to_date(found[0], last_year - 1)
    return start, end


def page_lines(soup):
    copy = BeautifulSoup(str(soup), 'html.parser')
    for node in copy(['script', 'style', 'noscript', 'svg']):
        node.decompose()
    return [cleaned for line in copy.get_text('\n').splitlines() if (cleaned := re.sub(r'\s+', ' ', line).strip())]


def block_between(lines, first, stops):
    if first not in lines:
        return []
    start = lines.index(first) + 1
    end = next((i for i in range(start, len(lines)) if lines[i] in stops), len(lines))
    return lines[start:end]


class MechanicsScraper(BaseEventScraper):
    source_id = 'mechanics'
    source_url = 'https://www.milibrary.org/chess/tournaments/'
    words_at_top = "Read Mechanics' Institute's tournament list, then each tournament page."

    def __init__(self):
        self.client = Client()

    def parse_listing(self, soup):
        found = {}
        for item in soup.select('li.tournament-list-item'):
            link = next((a for a in item.select('a[href]') if a['href'].startswith('/chess/tournaments/')), None)
            if link is None:
                continue
            heading = item.find_previous('h2')
            # The date is bold inside the same element, followed by ": name".
            name = re.sub(r'^.*?:\s*', '', text(item.select_one('.item-date')), count=1, flags=re.S).strip()
            found[urljoin(self.source_url, link['href'])] = (name, text(heading))
        if not found:
            raise ValueError("Mechanics' tournament list changed: no entries found")
        return found

    def detail(self, url, name, category, soup):
        lines = page_lines(soup)
        if 'Info' not in lines or 'Date:' not in lines:
            raise ValueError("Mechanics' detail page missing event fields (possible soft 404 or layout change)")
        info = block_between(lines, 'Info', {'Registration', 'Tournament Format'})
        values, label = {}, None
        for line in info:
            if line.rstrip(':') in INFO_LABELS and line.endswith(':'):
                label = line.rstrip(':')
                values[label] = ''
            elif label:
                values[label] = (values[label] + ' ' + line).strip()
        start, end = parse_when(values['Date'])
        registration = block_between(lines, 'Registration', {'Tournament Format', 'Prize Fund', 'Prizes'})
        fees = [line for line in registration if re.search(r'\bfee\b', line, re.I) and '$' in line and 'admin' not in line.lower()]
        register = [line for line in registration if re.match(r'(?:online|onsite) registration', line, re.I)]
        format_lines = block_between(lines, 'Tournament Format', {'Prize Fund', 'Prizes'})
        joined = ' '.join(format_lines)
        event = ScrapedEvent(id=stable_id(self.source_id, url, start.isoformat()), name=name, date=start.isoformat(),
            endDate=end.isoformat(), city='San Francisco', state='CA', venue="Mechanics' Institute Chess Club",
            address=ADDRESS, organizer="Mechanics' Institute Chess Club", website=url, source=self.source_id,
            sources=[source_ref(self.source_id, url)], online=False,
            entryFeeText=excerpt('\n'.join(fees)), registrationText=excerpt('\n'.join(register)),
            audience='scholastic' if re.search(r'scholastic', category + ' ' + name, re.I) else None)
        rating = values.get('Rating', '')
        event.rated = bool(rating) and 'unrated' not in rating.lower()
        event.ratingSystem = 'USCF' if 'USCF' in rating else 'FIDE' if 'FIDE' in rating else None
        event.fideRated = 'FIDE' in rating
        control = re.search(r'Time control:\s*(\d+(?:\.\d+)?)\s*min(?:ute)?s?\s*(?:base\s*time|basetime)?\s*(?:\+\s*(\d+)\s*sec(?:ond)?s?\s*(delay|increment))?', joined, re.I)
        if control:
            base = float(control[1])
            tc = {'kind': 'classical' if base >= 60 else 'rapid' if base >= 10 else 'blitz', 'baseMinutes': base, 'raw': re.sub(r'^Time control:\s*', '', control[0], flags=re.I).strip()}
            if control[2]:
                tc['delaySeconds' if control[3].lower() == 'delay' else 'incrementSeconds'] = int(control[2])
            event.timeControl, event.format, event.timeControls = tc, tc['kind'], [tc]
        rounds = block_between(format_lines, 'Round Times:', {'Sections:', 'Play-up rule:'})
        event.scheduleText = excerpt(' '.join(rounds)) if rounds else None
        rated_keep = event.rated, event.ratingSystem, event.fideRated, event.timeControl, event.format, event.timeControls
        enrich(event, '')
        event.rated, event.ratingSystem, event.fideRated, event.timeControl, event.format, event.timeControls = rated_keep
        return event

    def scrape(self):
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        events = []
        for url, (name, category) in self.parse_listing(self.client.soup(self.source_url)).items():
            event = self.detail(url, name, category, self.client.soup(url))
            if (event.endDate or event.date) >= cutoff:
                events.append(event)
        return events
