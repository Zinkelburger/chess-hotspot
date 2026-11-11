"""Recognize one tournament advertised under two titles by different sources.

A wrong merge hides a real event, so this only acts on strong evidence: the same
dates and city, from different sources, with titles that agree once editions and
filler are removed. Two titles differing by a word that separates events
("Blitz", "Scholastic") never merge. Ambiguous pairs are flagged for review.
"""
from collections import defaultdict
import re
import unicodedata

FILLER = set('a an and annual at by chess club center centre event for in of on presented the to tournament tourney us uscf rated'.split())
MONTHS = set('january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec'.split())
# Words that name a different competition on the same day at the same place.
SEPARATORS = {word[:-1] if len(word) > 4 and word.endswith('s') else word for word in """blitz rapid quick action bullet classical scholastic youth junior juniors kids elementary
    senior seniors adult adults women womens girls girl boys team teams individual bughouse side reserve premier
    championship championships beginner beginners novice open invitational quad quads swiss unrated""".split()}
ROMAN = re.compile(r'^[ivxlc]+$')
# Parentheticals describing logistics, not which competition this is.
LOGISTICS = re.compile(r'\([^)]*\b(?:days?|schedules?|sponsored|presented|rated)\b[^)]*\)?', re.I)


def title_tokens(name):
    plain = unicodedata.normalize('NFKD', LOGISTICS.sub(' ', name)).encode('ascii', 'ignore').decode().lower()
    plain = re.sub(r"['’]s?\b", '', plain)
    tokens = set()
    for word in re.findall(r'[a-z0-9$]+', plain):
        if word in FILLER or word in MONTHS or ROMAN.match(word):
            continue
        if re.fullmatch(r'\d+(?:st|nd|rd|th)?', word):
            continue  # Years, edition numbers and dates; the event's own date is compared directly.
        tokens.add(word[:-1] if len(word) > 4 and word.endswith('s') else word)
    return tokens


def titles_agree(left, right):
    a, b = title_tokens(left), title_tokens(right)
    if not a or not b:
        return False
    if a == b:
        return len(a) >= 2 or next(iter(a)) not in SEPARATORS
    small, large = (a, b) if len(a) < len(b) else (b, a)
    if len(small) < 2 or not small < large:
        return False
    return not any(word in SEPARATORS or re.fullmatch(r'[ku]\d+', word) for word in large - small)


def flag_cancelled_counterparts(group):
    """One source says cancelled, another still advertises what looks like the same event."""
    for event in group:
        if not event.cancellationEvidence:
            continue
        core = title_tokens(event.name) - {'cancelled', 'canceled', 'postponed'} - SEPARATORS
        for other in group:
            if other is not event and not source_ids(event) & source_ids(other) and same_place(event, other) and len(core & title_tokens(other.name)) >= 2:
                other.reviewFlags = sorted(set((other.reviewFlags or []) + ['possibly-cancelled-per-other-source']))


def source_ids(event):
    return {source['id'] for source in event.sources or []} or {event.source}


def same_place(a, b):
    left, right = (re.sub(r'\W+', '', event.city or '').casefold() for event in (a, b))
    if left and right:
        return left == right
    # A listing with no city needs the identical title to be taken as the same event.
    return bool(left or right) and re.sub(r'[^a-z0-9]', '', a.name.lower()) == re.sub(r'[^a-z0-9]', '', b.name.lower())


def merge_same_titles(events, merge):
    groups = defaultdict(list)
    for event in events:
        if event.state and not event.online:
            groups[(event.date, event.endDate or event.date, event.state)].append(event)
    absorbed = set()
    for group in groups.values():
        flag_cancelled_counterparts(group)
        pairs = [(a, b) for i, a in enumerate(group) for b in group[i+1:]
                 if not source_ids(a) & source_ids(b) and same_place(a, b) and titles_agree(a.name, b.name)]
        counts = defaultdict(int)
        for a, b in pairs:
            counts[id(a)] += 1
            counts[id(b)] += 1
        for a, b in pairs:
            if counts[id(a)] == 1 and counts[id(b)] == 1:
                merge(a, b)
                absorbed.add(id(b))
            else:
                for event in (a, b):
                    event.reviewFlags = sorted(set((event.reviewFlags or []) + ['possible-duplicate-listing']))
    kept = [event for event in events if id(event) not in absorbed]
    flag_linked_date_differences(kept)
    return kept


def flag_linked_date_differences(events):
    """An ad naming another source's page, under the same title, on another date: one of them is wrong."""
    by_url = {event.website.lower(): event for event in events}
    for event in events:
        other = by_url.get((event.registrationUrl or '').lower())
        if other is not None and other is not event and other.date != event.date and titles_agree(event.name, other.name):
            for item in (event, other):
                item.reviewFlags = sorted(set((item.reviewFlags or []) + ['linked-listing-date-differs']))
