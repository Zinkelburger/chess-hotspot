"""Marshall Chess Club: the server-rendered table behind its registration page."""
from datetime import date, timedelta
import re
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, enrich, parse_time_control, parse_time_controls, source_ref, stable_id, text
from .details import body_lines

MONTHS = {name: number for number, name in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(), 1)}
NOT_A_TOURNAMENT = re.compile(r'\bclass\b|\bcasual\b|\bworkshop\b|\blecture\b|\bcamp\b|\bsimul\b', re.I)


def parse_dates(raw, today):
    """Read 'Oct 7, 14, Nov 4' or 'Dec 30, Jan 6'. The page prints no year: the list
    runs forward from now, so the first date's year is the one nearest today, and
    the year advances when the months wrap.
    """
    dates, month, year = [], None, None
    for name, day in re.findall(r'(?:([A-Z][a-z]{2})\s+)?(\d{1,2})\b', raw):
        if name:
            if name not in MONTHS:
                raise ValueError(f'Unrecognized Marshall date: {raw}')
            number = MONTHS[name]
            if year is None:
                year = today.year + (1 if number < today.month - 6 else -1 if number > today.month + 6 else 0)
            elif number < month:
                year += 1
            month = number
        if month is None:
            raise ValueError(f'Unrecognized Marshall date: {raw}')
        dates.append(date(year, month, int(day)))
    if not dates:
        raise ValueError(f'Unrecognized Marshall date: {raw}')
    return dates


def labelled_line(lines, label):
    return next((line.split(':', 1)[1].strip() for line in lines if line.lower().startswith(label + ':')), None)


class MarshallScraper(BaseEventScraper):
    source_id = 'marshall'
    source_url = 'https://www.marshallchessclub.org/tournaments/upcoming'
    words_at_top = "Read Marshall's upcoming-events table."

    def __init__(self):
        self.client = Client()

    def parse(self, soup, today=None):
        today = today or date.today()
        events = []
        for toggle in soup.select('a[href^="#divdate"]'):
            row = toggle.find_parent('tr')
            cells = row.find_all('td', recursive=False)
            if len(cells) != 4:
                raise ValueError('Marshall table columns changed')
            details = cells[1].select_one('div.collapse')
            title = text(toggle)
            name = re.sub(r'\s*-\s*At Club!?\s*$', '', title).strip()
            control = text(cells[2])
            if NOT_A_TOURNAMENT.search(name) or not re.search(r'\bG\s*/\s*\d', control, re.I):
                continue
            raw = text(cells[0])
            dates = parse_dates(raw, today)
            start = dates[0].isoformat()
            slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
            # A registration link appears only ten days out, so it cannot identify an event.
            url = f'{self.source_url}#{start}-{slug}'
            online = 'at club' not in title.lower()
            lines = body_lines(details).splitlines()
            event = ScrapedEvent(id=stable_id(self.source_id, url, start), name=name, date=start,
                endDate=dates[-1].isoformat(), dateText=raw, online=online,
                city=None if online else 'New York', state=None if online else 'NY',
                venue=None if online else 'Marshall Chess Club',
                address=None if online else '23 West 10th Street, New York, NY 10011',
                organizer='Marshall Chess Club', website=url, source=self.source_id,
                sources=[source_ref(self.source_id, url)],
                entryFeeText=labelled_line(lines, 'entry fee'), scheduleText=labelled_line(lines, 'rounds'),
                registrationText=next((line for line in lines if line.lower().startswith('registration ')), None))
            enrich(event, ' '.join(lines))
            # The table's own time-control column outranks controls mentioned in the notes.
            event.timeControl = parse_time_control(control)
            event.timeControls = parse_time_controls(control) or None
            event.format = event.timeControl['kind']
            event.sections = None
            events.append(event)
        if not events:
            raise ValueError('Marshall returned no tournaments')
        return events

    def scrape(self):
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        return [e for e in self.parse(self.client.soup(self.source_url)) if (e.endDate or e.date) >= cutoff]

