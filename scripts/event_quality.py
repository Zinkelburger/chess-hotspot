"""Deterministic review report for event refreshes (no additional network traffic)."""
from collections import Counter
from datetime import date, datetime, timezone


def review_report(events, statuses, now=None, required_sources=('uscf', 'nachesshub', 'boylston', 'cca')):
    now = now or datetime.now(timezone.utc)
    issues = []
    missing = set(required_sources) - {s['id'] for s in statuses}
    issues.extend({'severity': 'error', 'code': 'source-missing', 'source': source} for source in sorted(missing))
    for status in statuses:
        if status['id'] == 'maca':  # Its site has refused connections before; Hub covers its registrations, so it never blocks.
            continue
        success = status.get('lastSuccess')
        if status.get('status') != 'ok':
            issues.append({'severity': 'error', 'code': 'source-failed', 'source': status['id'], 'detail': status.get('error', 'No successful refresh')})
        elif not success or (now - datetime.fromisoformat(success.replace('Z', '+00:00'))).total_seconds() > 10 * 86400:
            issues.append({'severity': 'error', 'code': 'source-stale', 'source': status['id']})
    for event in events:
        for flag in event.reviewFlags or []:
            issues.append({'severity': 'error' if flag.startswith('source-conflict-') else 'warning', 'code': flag, 'eventId': event.id, 'url': event.website})
        if event.cancellationEvidence:
            issues.append({'severity': 'warning', 'code': 'cancelled-or-postponed-excluded', 'eventId': event.id, 'url': event.website, 'evidence': event.cancellationEvidence})
        if (date.fromisoformat(event.endDate or event.date) - date.fromisoformat(event.date)).days > 7:
            issues.append({'severity': 'warning', 'code': 'recurring-or-long-date-range', 'eventId': event.id, 'url': event.website})
    active = [e for e in events if not e.cancellationEvidence]
    physical = [e for e in active if not e.online]
    coverage = {
        'events': len(active),
        'withFees': sum(bool(e.entryFeeText) or e.entryFeeUsdMin is not None for e in active),
        'withSchedule': sum(bool(e.scheduleText or e.time or e.notes) for e in active),
        'withRegistration': sum(bool(e.registrationText) for e in active),
        'physicalEvents': len(physical),
        'mapped': sum(e.lat is not None for e in physical),
        'venueCoordinates': sum(e.locationPrecision == 'venue' for e in physical),
    }
    return {'checkedAt': now.isoformat(timespec='seconds'), 'passed': not any(i['severity'] == 'error' for i in issues),
            'coverage': coverage, 'issueCounts': dict(Counter(i['code'] for i in issues)), 'issues': issues}
