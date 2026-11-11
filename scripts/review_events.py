#!/usr/bin/env python3
"""Regenerate the review report from saved snapshots; exit nonzero on blockers."""
import argparse
from dataclasses import fields
from datetime import date, timedelta
import json
from pathlib import Path
from events_scrapers.base import ScrapedEvent
from event_quality import review_report
from scrape_events import REGISTRY, atomic_write, deduplicate, validate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--strict', action='store_true')
    args = parser.parse_args()
    status_path = Path('public/events-status.json')
    status = json.loads(status_path.read_text())
    allowed = {f.name for f in fields(ScrapedEvent)}
    cutoff = (date.today() - timedelta(days=1)).isoformat()
    events = []
    for source in REGISTRY:
        path = Path('data/event-sources') / (source + '.json')
        if not path.exists(): continue
        events.extend(ScrapedEvent(**{k:v for k,v in raw.items() if k in allowed}) for raw in json.loads(path.read_text())
                      if (raw.get('endDate') or raw['date']) >= cutoff and raw.get('country', 'US') == 'US')
    events = deduplicate(events)
    validate(events)
    report = review_report(events, status['sources'], required_sources=set(REGISTRY) - {'maca'})
    published = json.loads(Path('public/events.v1.json').read_text())
    expected = {e.id: e.to_dict() for e in events if not e.cancellationEvidence}
    actual = {e['id']: e for e in published}
    if actual != expected or len(actual) != len(published):
        report['passed'] = False
        changed = sorted(key for key in expected.keys() | actual.keys() if expected.get(key) != actual.get(key))
        report['issues'].append({'severity': 'error', 'code': 'publication-snapshot-mismatch',
                                 'detail': 'Public events do not match the reviewed source snapshots.', 'eventIds': changed[:20]})
        report['issueCounts']['publication-snapshot-mismatch'] = 1
    atomic_write(Path('public/events-review.json'), report)
    status['quality'] = {k:v for k,v in report.items() if k != 'issues'}
    atomic_write(status_path, status)
    print(json.dumps({k:v for k,v in report.items() if k != 'issues'}, indent=2))
    if args.strict and not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
