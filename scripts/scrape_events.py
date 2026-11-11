#!/usr/bin/env python3
"""Refresh source snapshots, validate, deduplicate, then atomically publish.
Failures retain the last good source snapshot and are reported in events-status.json.
"""
from __future__ import annotations
import argparse
from collections import Counter
import fcntl
from dataclasses import fields
from datetime import date, datetime, timezone, timedelta
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse
from events_scrapers.base import ScrapedEvent
from events_scrapers.cca import CCAScraper
from events_scrapers.common import source_ref, state_code
from events_scrapers.uscf import USCFScraper
from events_scrapers.local import HubScraper, BoylstonScraper
from events_scrapers.maca import MACAScraper
from events_scrapers.kingregistration import KingRegistrationScraper
from events_scrapers.chessreg import ChessRegScraper
from events_scrapers.marshall import MarshallScraper
from events_scrapers.mechanics import MechanicsScraper
from events_scrapers.nwchess import NWChessScraper
from events_scrapers.stlouis import SaintLouisScraper
from events_scrapers.geocode import Geocoder
from event_quality import review_report
from event_merge import merge_same_titles

REGISTRY = {
    'uscf': ('US Chess', USCFScraper),
    'nachesshub': ('NA Chess Hub', HubScraper),
    'boylston': ('Boylston', BoylstonScraper),
    'maca': ('MACA', MACAScraper),
    'cca': ('Continental Chess', CCAScraper),
    'kingregistration': ('King Registration', KingRegistrationScraper),
    'stlouis': ('Saint Louis Chess Club', SaintLouisScraper),
    'nwchess': ('Northwest Chess', NWChessScraper),
    'mechanics': ("Mechanics' Institute", MechanicsScraper),
    'marshall': ('Marshall Chess Club', MarshallScraper),
    'chessreg': ('ChessReg', ChessRegScraper),
}

def atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(payload, indent=2) + '\n')
    tmp.replace(path)

def validate(events):
    ids = set()
    for e in events:
        if not e.name.strip() or e.id in ids: raise ValueError('Missing name or duplicate source ID')
        ids.add(e.id)
        date.fromisoformat(e.date)
        if e.endDate and date.fromisoformat(e.endDate) < date.fromisoformat(e.date): raise ValueError(f'Inverted date range: {e.id}')
        if not e.website or urlparse(e.website).scheme not in ('http','https') or not urlparse(e.website).netloc: raise ValueError(f'Invalid source URL: {e.id}')
        if e.timeControl and e.format != e.timeControl.get('kind'): raise ValueError(f'Conflicting format and time control: {e.id}')
        for tc in e.timeControls or ([e.timeControl] if e.timeControl else []):
            if tc.get('baseMinutes', 1) <= 0: raise ValueError(f'Invalid time control: {e.id}')
        if e.entryFeeUsdMin is not None and (e.entryFeeUsdMin < 0 or (e.entryFeeUsdMax is not None and e.entryFeeUsdMax < e.entryFeeUsdMin)):
            raise ValueError(f'Invalid fee range: {e.id}')
        if (e.lat is None) != (e.lng is None): raise ValueError('Incomplete coordinates')
        if e.lat is not None and not (-90 <= e.lat <= 90 and -180 <= e.lng <= 180): raise ValueError('Invalid coordinates')

def merge_into(match, e):
    """Fold listing e into match, keeping every source link and flagging disagreements."""
    conflicts = [f for f in ('endDate', 'online', 'format') if getattr(match, f) is not None and getattr(e, f) is not None and getattr(match, f) != getattr(e, f)]
    notices = []
    if 'format' in conflicts:
        left = {tc['kind'] for tc in match.timeControls or []} - {'custom'} or ({match.format} - {'custom'})
        right = {tc['kind'] for tc in e.timeControls or []} - {'custom'} or ({e.format} - {'custom'})
        if not left or not right or left & right:
            conflicts.remove('format')
            notices.append('source-format-coverage-differs')
    match.reviewFlags = sorted(set((match.reviewFlags or []) + (e.reviewFlags or []) + notices + ['source-conflict-' + f for f in conflicts])) or None
    refs = {(s['id'],s['url']):s for s in (match.sources or []) + (e.sources or [])}
    match.sources = list(refs.values())
    for f in fields(ScrapedEvent):
        if f.name in {'id','source','sources'}: continue
        if f.name in {'timeControl', 'timeControls'} and match.format and e.format != match.format: continue
        if getattr(match, f.name) is None: setattr(match,f.name,getattr(e,f.name))

def deduplicate(events):
    """Merge shared URLs on a date, then exact normalized name + date + city/state,
    then the strict title rule in event_merge. Generic names without a location
    never collapse. Preserve every source link.
    """
    result, index = [], {}
    # An ad naming a registration page identifies that platform's listing, but
    # several ads can name one page, so it only counts when exactly one does.
    cited = Counter((e.registrationUrl.lower(), e.date) for e in events if e.registrationUrl)
    for e in events:
        normalized = re.sub(r'[^a-z0-9]', '', e.name.lower())
        keys = [('url',e.website.lower(),e.date)]
        if e.city and e.state: keys.append(('name',normalized,e.date,e.city.casefold(),e.state))
        lookups = keys + [('cites',e.website.lower(),e.date)]
        match = next((index[k] for k in lookups if k in index), None)
        if match is None:
            match = e; result.append(e)
        else:
            merge_into(match, e)
        for key in keys: index[key] = match
        if e.registrationUrl and cited[(e.registrationUrl.lower(), e.date)] == 1:
            index[('cites',e.registrationUrl.lower(),e.date)] = match
    result = merge_same_titles(result, merge_into)
    return sorted(result,key=lambda e:(e.date,e.name))

def refresh_source(scraper, previous):
    events = scraper.scrape()
    if hasattr(scraper, 'retain_unexpired'):
        events = scraper.retain_unexpired(events, previous)
    if not events: raise ValueError('Empty result; retaining last good snapshot')
    validate(events)
    if previous and len(events) < len(previous)*.5:
        raise ValueError(f'Count dropped from {len(previous)} to {len(events)}; inspect source before replacing snapshot')
    return events

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources',nargs='+',choices=list(REGISTRY),default=list(REGISTRY))
    parser.add_argument('--output',default='public/events.v1.json')
    parser.add_argument('--no-geocode',action='store_true')
    parser.add_argument('--strict',action='store_true',help='Exit nonzero when any requested source fails (after writing health and safe snapshots).')
    args=parser.parse_args()
    Path('data').mkdir(exist_ok=True)
    lock = Path('data/event-refresh.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.exit(2, 'Another event refresh is already running.\n')
    os.environ['CHESS_HOTSPOT_GEOCODE']='0'
    now=datetime.now(timezone.utc).isoformat(timespec='seconds')
    output=Path(args.output); status_path=output.with_name('events-status.json')
    old_status=json.loads(status_path.read_text()) if status_path.exists() else {'sources':[]}
    statuses={s['id']:s for s in old_status['sources']}
    all_events=[]; failures=[]; geocoder=Geocoder() if not args.no_geocode else None
    old_published=json.loads(output.read_text()) if output.exists() else []
    allowed={f.name for f in fields(ScrapedEvent)}
    for source_id,(name,cls) in REGISTRY.items():
        snapshot=Path(f'data/event-sources/{source_id}.json')
        raw=json.loads(snapshot.read_text()) if snapshot.exists() else [e for e in old_published if (e.get('source') or ('cca' if e['id'].startswith('cca-') else None))==source_id]
        previous=[ScrapedEvent(**{k:v for k,v in e.items() if k in allowed}) for e in raw]
        events=previous
        if source_id in args.sources:
            print(f'[{source_id}] {cls.words_at_top}',flush=True)
            try:
                events=refresh_source(cls(),previous)
                for e in events:
                    e.source=source_id; e.sources=e.sources or [source_ref(source_id,e.website)]
                    if not e.state and e.address:
                        m=re.search(r',?\s+([A-Z]{2})\s+\d{5}',e.address)
                        if m:
                            e.state=state_code(m[1]); e.city=e.address[:m.start()].rsplit(',',1)[-1].strip()
                    if geocoder and (e.endDate or e.date)>=(date.today()-timedelta(days=1)).isoformat(): geocoder.resolve(e)
                validate(events)
                atomic_write(snapshot,[e.to_dict() for e in events])
                statuses[source_id]={'id':source_id,'name':name,'url':cls.source_url,'status':'ok','lastAttempt':now,'lastSuccess':now,'count':len(events)}
                print(f'[{source_id}] {len(events)} events',flush=True)
            except Exception as exc:
                events=previous; failures.append(source_id)
                statuses[source_id]={'id':source_id,'name':name,'url':cls.source_url,'status':'error','lastAttempt':now,'lastSuccess':statuses.get(source_id,{}).get('lastSuccess'),'count':len(previous),'error':str(exc)}
                print(f'[{source_id}] FAILED: {exc}; retained {len(previous)}',flush=True)
        all_events.extend(events)
    if geocoder: geocoder.save()
    published=deduplicate([e for e in all_events if (e.endDate or e.date)>=(date.today()-timedelta(days=1)).isoformat() and e.country=='US'])
    validate(published)
    quality = review_report(published, list(statuses.values()), required_sources=set(REGISTRY) - {'maca'})
    previous_active = [e for e in old_published if (e.get('endDate') or e['date']) >= (date.today()-timedelta(days=1)).isoformat()]
    if previous_active and len(published) < len(previous_active) * .7:
        quality['passed'] = False
        quality['issues'].append({'severity':'error', 'code':'directory-count-drop', 'detail':f'Upcoming events dropped from {len(previous_active)} to {len(published)}; review before release.'})
        quality['issueCounts']['directory-count-drop'] = 1
    atomic_write(output.with_name('events-review.json'), quality)
    published = [e for e in published if not e.cancellationEvidence]
    if not quality['passed']:
        published = [ScrapedEvent(**{k:v for k,v in e.items() if k in allowed}) for e in old_published]
        print('Review blocked publication; retained the previous public directory.', flush=True)
    elif published: atomic_write(output,[e.to_dict() for e in published])
    elif all_events and not failures: atomic_write(output,[])
    atomic_write(status_path,{'updatedAt':now,'sources':list(statuses.values()),'eventCount':len(published),'mappedCount':sum(e.lat is not None and not e.online for e in published),'quality':{k:v for k,v in quality.items() if k != 'issues'}})
    print(f'Directory contains {len(published)} events; failed sources: {failures}; review passed: {quality["passed"]}',flush=True)
    if (failures or not quality['passed']) and args.strict: raise SystemExit(1)

if __name__=='__main__': main()
