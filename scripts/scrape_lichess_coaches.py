#!/usr/bin/env python3
"""Collect the US coaches from Lichess's public coach directory.

Lichess lists coaches who have chosen to advertise lessons. The country filter
needs a login, so this pages through the whole alphabetical list (about 250
pages of ten) and keeps the cards flagged United States. One request every two
seconds, cached for a week; a full run takes about ten minutes.

Writes data/learn-sources/lichess-coaches.json. Run on demand:

    python3 scripts/scrape_lichess_coaches.py
"""
from __future__ import annotations
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from events_scrapers.common import Client, text  # noqa: E402

BASE = 'https://lichess.org'
LIST = BASE + '/coach/all/all/alphabetical?page={page}'
OUT = Path('data/learn-sources/lichess-coaches.json')
DELAY = 2.0
MAX_PAGES = 400
EMAIL = re.compile(r'\S+@\S+\.\S+')


def parse_card(card):
    """One directory card, or None when it is not a US coach."""
    flag = card.select_one('.flag img')
    if not flag or '/flags/US.' not in flag.get('src', ''):
        return None
    link = card.select_one('a.overlay')
    name_node = card.select_one('.coach-name')
    title_node = name_node.select_one('.utitle') if name_node else None
    title = text(title_node)
    if title_node:
        title_node.extract()
    rows = {text(row.th): row.td for row in card.select('tr') if row.th and row.td}
    rating = re.search(r'FIDE:\s*(\d{3,4})', text(rows.get('Rating')))
    seen = card.select_one('time.timeago')
    username = link['href'].rsplit('/', 1)[-1]
    return {
        'username': username,
        'name': text(name_node),
        'title': title or None,
        # Coaches write their own headline; an address in it belongs on their page.
        'headline': EMAIL.sub('', text(card.select_one('.headline'))).strip() or None,
        'location': text(card.select_one('.location')) or None,
        'languages': [part.strip() for part in text(rows.get('Languages')).split(',') if part.strip()],
        'fideRating': int(rating[1]) if rating else None,
        'rate': EMAIL.sub('', text(rows.get('Hourly rate'))).strip() or None,
        'lastActive': seen['datetime'][:10] if seen and seen.get('datetime') else None,
        'url': f'{BASE}/coach/{username}',
    }


def main():
    client = Client(ttl=7 * 86400)
    coaches, total, pages = {}, 0, 0
    for page in range(1, MAX_PAGES + 1):
        url = LIST.format(page=page)
        started = time.monotonic()
        soup = client.soup(url)
        cards = soup.select('article.coach-widget')
        if not cards:
            break
        pages, total = page, total + len(cards)
        for card in cards:
            coach = parse_card(card)
            if coach:
                coaches[coach['username'].lower()] = coach
        if page % 20 == 0:
            print(f'[lichess] page {page}: {len(coaches)} US coaches of {total}', flush=True)
        if not soup.select_one('.pager a[rel=next]'):
            break
        # Only wait after a real request; cached pages come back instantly.
        if time.monotonic() - started > 0.05:
            time.sleep(DELAY)
    if pages < 20:
        sys.exit(f'Only {pages} pages came back; keeping the previous snapshot.')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        'source': BASE + '/coach',
        'fetchedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'listed': total,
        'coaches': sorted(coaches.values(), key=lambda c: c['username'].lower()),
    }, indent=1, ensure_ascii=False) + '\n')
    print(f'[lichess] {len(coaches)} US coaches of {total} listed, {pages} pages -> {OUT}')


if __name__ == '__main__':
    main()
