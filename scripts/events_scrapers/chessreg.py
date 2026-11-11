"""ChessReg: the documented public JSON API of a Pacific Northwest registration platform."""
from datetime import date, datetime, timedelta
import json
import re
from bs4 import BeautifulSoup
from .base import BaseEventScraper, ScrapedEvent
from .common import Client, enrich, source_ref, stable_id, state_code

NOT_A_TOURNAMENT = re.compile(r'\bcamp\b|\blessons?\b|\bclass(?:es)?\b|\bworkshop\b|\bsimul\b', re.I)


def parse_address(address):
    """'13620 NE 20th St Suite K, Bellevue, WA 98005, USA' -> city, state."""
    match = re.search(r'([^,]+),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?(?:,\s*USA)?\s*$', address or '')
    return (match[1].strip(), state_code(match[2])) if match else (None, None)


class ChessRegScraper(BaseEventScraper):
    source_id = 'chessreg'
    source_url = 'https://chessreg.com/api/v/1/tournaments'
    words_at_top = "Read ChessReg's published tournament API."

    def __init__(self):
        self.client = Client()

    def parse(self, payload):
        if not isinstance(payload, list):
            raise ValueError('ChessReg API changed: expected a list of tournaments')
        events = []
        for item in payload:
            name = item['name'].strip()
            if NOT_A_TOURNAMENT.search(name):
                continue
            start = datetime.fromisoformat(item['date'])
            url = item['url']
            city, state = parse_address(item.get('address'))
            address = re.sub(r',\s*USA\s*$', '', item.get('address') or '') or None
            cutoff = item.get('registration_cutoff')
            fee = float(item.get('fee') or 0)
            event = ScrapedEvent(id=stable_id(self.source_id, url, start.date().isoformat()), name=name,
                date=start.date().isoformat(), time=start.strftime('%H:%M'), timezone=item.get('timezone'),
                city=city, state=state, address=address, online=False, website=url, source=self.source_id,
                sources=[source_ref(self.source_id, url)],
                # A price of zero can mean the fee is collected elsewhere, so it says nothing.
                entryFeeText=f'${fee:.2f} online entry as listed on ChessReg' if fee else None,
                registrationText=f"Online registration closes {datetime.fromisoformat(cutoff).strftime('%B %-d, %Y at %-I:%M %p')} ({item.get('timezone')})" if cutoff else None)
            note = BeautifulSoup(item.get('note') or '', 'html.parser').get_text(' ', strip=True)
            enrich(event, note)
            event.sections = None
            events.append(event)
        if not events:
            raise ValueError('ChessReg returned no tournaments')
        return events

    def scrape(self):
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        payload = json.loads(self.client.get(self.source_url, headers={'Accept': 'application/json'}))
        return [e for e in self.parse(payload) if e.date >= cutoff]
