#!/usr/bin/env python3
"""Build public/learn.v1.json: the people and places that teach chess.

Two sources, both already public directories:

* US Chess affiliates (data/uscf_clubs_v2.json) that list Lessons, Classes or
  Chess Camps among their activities, joined to the hand-checked club records
  in public/spots.v1.json for verified websites, notes and exact coordinates.
  A school's own club is left out: it teaches its own pupils.
* US coaches from Lichess's coach directory
  (data/learn-sources/lichess-coaches.json, see scrape_lichess_coaches.py).

Locations are GeoNames postal centroids (CC BY 4.0), the same table the
tournament pins use: a ZIP code when the address has one, otherwise the town.
No phone numbers or e-mail addresses are published. Makes no network requests
unless the GeoNames table has never been downloaded.

    python3 scripts/build_learn.py
"""
from __future__ import annotations
import csv
import io
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from events_scrapers.common import STATES  # noqa: E402

AFFILIATES = Path('data/uscf_clubs_v2.json')
SPOTS = Path('public/spots.v1.json')
COACHES = Path('data/learn-sources/lichess-coaches.json')
GEONAMES = Path('data/geonames/US.zip')
OUT = Path('public/learn.v1.json')

TEACHING = {'Lessons': 'lessons', 'Classes': 'classes', 'Chess Camps': 'camps'}
# Research verdicts that mean "there is nothing here to send a learner to".
DROP_REASONS = {'no_info', 'military', 'state_org', 'online_only', 'other'}
ACADEMY_WORDS = re.compile(
    r'academy|school of chess|chess school|institute|scholastic|kids|youth|education|learning|'
    r'camp|enrichment|coaching|tutor|foundation|in the schools', re.I)
# A school's own club teaches its own pupils; a visitor cannot sign up for it.
K12_WORDS = re.compile(
    r'elementary|middle|high school|\bechs\b|charter|homeschool|parish|prep center|stem academy|'
    r'secondary school|christel house|western reserve academy|(?<!chess )\bschool\b(?! of chess)', re.I)
STATE_CODES = {name.casefold(): code for code, name in STATES.items()}
STATE_CODES.update({code.casefold(): code for code in STATES})
# What people type instead of a town.
ALIASES = {
    'nyc': ('New York', 'NY'), 'new york city': ('New York', 'NY'), 'manhattan': ('New York', 'NY'),
    'brooklyn': ('Brooklyn', 'NY'), 'queens': ('Queens', 'NY'), 'bay area': ('San Francisco', 'CA'),
    'san francisco bay area': ('San Francisco', 'CA'), 'sf': ('San Francisco', 'CA'),
    'silicon valley': ('San Jose', 'CA'), 'dc': ('Washington', 'DC'), 'washington dc': ('Washington', 'DC'),
    'washington d.c.': ('Washington', 'DC'), 'philly': ('Philadelphia', 'PA'), 'vegas': ('Las Vegas', 'NV'),
    'saint louis': ('Saint Louis', 'MO'), 'st. louis': ('Saint Louis', 'MO'), 'st louis': ('Saint Louis', 'MO'),
    'st.louis': ('Saint Louis', 'MO'),
}


class Places:
    """GeoNames postal rows, indexed by ZIP code and by town."""

    def __init__(self):
        if not GEONAMES.exists():
            import requests
            response = requests.get('https://download.geonames.org/export/zip/US.zip', timeout=60)
            response.raise_for_status()
            GEONAMES.parent.mkdir(parents=True, exist_ok=True)
            GEONAMES.write_bytes(response.content)
        with zipfile.ZipFile(GEONAMES) as archive:
            rows = list(csv.reader(io.StringIO(archive.read('US.txt').decode()), delimiter='\t'))
        self.by_zip, self.by_town, self.states_of = {}, defaultdict(list), defaultdict(Counter)
        for row in rows:
            code, town, state, lat, lng = row[1], row[2], row[4], float(row[9]), float(row[10])
            self.by_zip[code] = (state, lat, lng, town)
            self.by_town[(town.casefold(), state)].append((lat, lng))
            self.states_of[town.casefold()][state] += 1

    def zip(self, code, state):
        hit = self.by_zip.get(code)
        return hit if hit and (not state or hit[0] == state) else None

    def town(self, town, state):
        points = self.by_town.get((town.casefold(), state))
        if not points:
            return None
        return sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)

    def likely_state(self, town):
        """The state a bare town name almost certainly means, or None."""
        counts = self.states_of.get(town.casefold())
        if not counts:
            return None
        (state, top), total = counts.most_common(1)[0], sum(counts.values())
        return state if top / total >= 0.7 and top >= 2 else None


def tidy_town(value):
    value = re.sub(r'\s+', ' ', value or '').strip(' ,')
    return value.title() if value.isupper() or value.islower() else value


def website_for(raw, spot):
    """The club's own verified site if research found one, else what US Chess lists."""
    urls = []
    if spot and spot.get('website'):
        urls = [spot['website']] if isinstance(spot['website'], str) else list(spot['website'])
        confidence = spot.get('website_confidence') or {}
        urls = [u for u in urls if confidence.get(u) != 'mismatch']
        if not urls and confidence:
            return None  # the only known site belongs to someone else
    if not urls and raw:
        urls = [raw.strip()]
    for url in urls:
        if not re.match(r'https?://', url, re.I):
            url = 'http://' + url
        if re.match(r'https?://[^\s/]+\.[a-z]{2,}', url, re.I):
            return url
    return None


def affiliate_kind(affiliate, spot):
    """'academy' (a chess school or programme), 'club', or None for a school's own club."""
    kind = affiliate.get('affiliate_type')
    reason = (spot or {}).get('skip_reason')
    name = affiliate['name']
    if (kind == 'School' or reason == 'school') and K12_WORDS.search(name):
        return None
    if (kind in ('Chess Camp/Program', 'Organizer') or reason in ('academy', 'scholastic', 'coaching_business', 'youth_only')
            or ACADEMY_WORDS.search(name) or re.search(r'chess school|school of chess', name, re.I)):
        return 'academy'
    return 'club'


def build_affiliates(places):
    spots = {s['uscf_id']: s for s in json.loads(SPOTS.read_text()) if s.get('uscf_id')}
    out = []
    for state_name, affiliates in json.loads(AFFILIATES.read_text()).items():
        state = STATE_CODES.get(state_name.casefold())
        if not state:
            continue
        for affiliate in affiliates:
            offers = [TEACHING[a] for a in TEACHING if a in affiliate.get('activities', [])]
            spot = spots.get(affiliate.get('uscf_id'))
            if not offers or affiliate.get('affiliate_type') in ('State Chapter', 'League'):
                continue
            if spot and (spot.get('is_active_uscf') is False or spot.get('skip_reason') in DROP_REASONS):
                continue
            kind = affiliate_kind(affiliate, spot)
            if not kind:
                continue
            town = tidy_town((spot or {}).get('city') or affiliate.get('city'))
            if town.casefold() in ('various', 'n/a', ''):
                town = ''
            record = {
                'id': 'uscf-' + affiliate['uscf_id'],
                'kind': kind,
                'name': re.sub(r'\s+', ' ', (spot or affiliate)['name']).strip(),
                'city': town or None,
                'state': state,
                'offers': offers,
                'beginners': 'Beginners Welcome' in affiliate.get('activities', []),
                'kids': 'Under 18 Permitted' in affiliate.get('activities', []),
                'website': website_for(affiliate.get('website'), spot),
                'notes': (spot or {}).get('notes') or None,
                'source': 'uscf',
            }
            listed = spot and spot.get('lat') is not None and spot.get('skip') is not True \
                and spot.get('has_weekly_club_meetings') is not False
            codes = re.findall(r'\b(\d{5})(?:-\d{4})?\b', affiliate.get('address') or '')
            postal = places.zip(codes[-1], state) if codes else None
            centre = places.town(town, state) if town else None
            if listed:
                record.update(lat=spot['lat'], lng=spot['lng'], precision='venue', clubId=spot['id'])
            elif postal:
                record.update(lat=round(postal[1], 4), lng=round(postal[2], 4), precision='postal')
                record['city'] = record['city'] or postal[3]
            elif centre:
                record.update(lat=round(centre[0], 4), lng=round(centre[1], 4), precision='city')
            out.append({k: v for k, v in record.items() if v not in (None, False, '')})
    return out


def locate_coach(text, places):
    """(city, state) from a coach's free-text location; either may be None."""
    value = re.sub(r'[\s,]*(?:\bU\.?S\.?A?\.?|\bUnited States(?: of America)?)\s*$', '', text or '', flags=re.I)
    value = re.sub(r'\s+', ' ', value).strip(' ,.')
    if not value:
        return None, None
    if value.casefold() in ALIASES:
        return ALIASES[value.casefold()]
    if value.casefold() in STATE_CODES and (len(value) > 2 or value.isupper()):
        return None, STATE_CODES[value.casefold()]
    parts = [p.strip() for p in re.split(r'[,/|;]| - ', re.sub(r'\s+area$', '', value, flags=re.I)) if p.strip()]
    # "Texas, Lubbock": the state came first.
    if len(parts) == 2 and parts[0].casefold() in STATE_CODES and parts[1].casefold() not in STATE_CODES:
        parts.reverse()
    state = next((STATE_CODES[p.casefold()] for p in reversed(parts[1:]) if p.casefold() in STATE_CODES), None)
    town = parts[0]
    if not state:
        tail = re.match(r'^(.*\S)\s+([A-Za-z]{2})$', town)
        if tail and tail[2].upper() in STATES and places.town(tail[1], tail[2].upper()):
            town, state = tail[1], tail[2].upper()
        else:
            # "Mansfield Ohio": a state's full name with no comma before it.
            named = next((n for n in STATES.values() if town.casefold().endswith(' ' + n.casefold())), None)
            if named:
                town, state = town[:-len(named)].strip(), STATE_CODES[named.casefold()]
    if town.casefold() in ALIASES:
        town, alias_state = ALIASES[town.casefold()]
        state = state or alias_state
    state = state or places.likely_state(town)
    if state and places.town(town, state):
        return tidy_town(town), state
    return None, state


def tidy_text(text, limit=None):
    """Drop what is left of a sentence that ended in a removed e-mail address."""
    dangling = r'(?:or|and|at|to|my|me|is|via|by|e-?mail|contact|write|reach|message)'
    text = re.sub(rf'[\s,;.:\-–]*(?:\b{dangling}\b[\s:,]*)+$', '', text or '', flags=re.I)
    text = re.sub(r'\s+', ' ', text).strip(' -–:;,')
    return (text[:limit] if limit else text) or None


def build_coaches(places):
    if not COACHES.exists():
        return [], None
    data = json.loads(COACHES.read_text())
    out = []
    for coach in data['coaches']:
        city, state = locate_coach(coach.get('location'), places)
        centre = places.town(city, state) if city and state else None
        record = {
            'id': 'lichess-' + coach['username'].lower(),
            'kind': 'coach',
            'name': coach['name'] or coach['username'],
            'title': coach.get('title'),
            'city': city,
            'state': state,
            'place': coach.get('location'),
            'offers': ['lessons'],
            'online': True,
            'fideRating': coach.get('fideRating'),
            'rate': tidy_text(coach.get('rate'), 160),
            'languages': coach.get('languages') or None,
            'notes': tidy_text(coach.get('headline')),
            'lastActive': coach.get('lastActive'),
            'website': coach['url'],
            'source': 'lichess',
        }
        if centre:
            record.update(lat=round(centre[0], 4), lng=round(centre[1], 4), precision='city')
        out.append({k: v for k, v in record.items() if v not in (None, False, '')})
    return out, data.get('fetchedAt')


def main():
    places = Places()
    affiliates = build_affiliates(places)
    coaches, coaches_at = build_coaches(places)
    listings = sorted(affiliates + coaches, key=lambda r: (r['name'].casefold(), r['id']))
    OUT.write_text(json.dumps({
        'updatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'coachesFetchedAt': coaches_at,
        'listings': listings,
    }, indent=1, ensure_ascii=False) + '\n')
    kinds = Counter(r['kind'] for r in listings)
    mapped = sum('lat' in r for r in listings)
    print(f'{len(listings)} listings ({dict(kinds)}), {mapped} on the map -> {OUT}')


if __name__ == '__main__':
    main()
