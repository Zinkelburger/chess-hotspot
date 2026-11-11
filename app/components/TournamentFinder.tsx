'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { preload } from 'react-dom';
import clsx from 'clsx';
import type { Feature, FeatureCollection, Point } from 'geojson';
import {
  FORMATS,
  FORMAT_LABELS,
  KIND_COLORS,
  coordKey,
  eventItem,
  hasPin,
  isBigEvent,
  isListedEvent,
  itemHash,
  localDate,
  parseItemHash,
  shortDate,
  type Item,
} from '@/lib/explore';
import { withinBounds } from '@/lib/events';
import {
  LENGTHS,
  LENGTH_LABELS,
  PRIZES,
  activeFilterCount,
  buildRows,
  defaultDescending,
  defaultTFilters,
  feeHint,
  filterRows,
  formatMiles,
  groupRows,
  relativeDay,
  sortRows,
  tFiltersFromParams,
  tFiltersToParams,
  whereText,
  type TFilters,
  type TRow,
  type TSort,
} from '@/lib/tournaments';
import { STATES } from '@/lib/us-states';
import { eventPath } from '@/lib/event-seo';
import type { TournamentData } from '@/app/tournaments-data.json/route';
import { usePopupHistory } from '@/app/hooks/usePopupHistory';
import type { PinProps } from './ExploreMap';
import Chip from './Chip';
import DetailPopup, { StackPopup, TournamentDetails } from './DetailPopup';
import { FORMAT_PILL } from './FilterBar';
import FinderShell, {
  ListFooter,
  PickedBanner,
  useInlineDetail,
  boxAround,
  readSavedPlace,
  savePlace,
  useFinderView,
} from './FinderShell';

const DATA_PATH = '/tournaments-data.json';
/** Rows drawn at first, and added per "Show more". */
const PAGE = 150;

const SORT_LABELS: Record<TSort, string> = {
  date: 'Soonest first',
  distance: 'Nearest first',
  prize: 'Biggest prizes',
  name: 'Name A–Z',
  place: 'State and city',
};

const dollars = (value: number) => `$${value.toLocaleString('en-US')}`;
const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter(x => x !== value) : [...list, value];

/**
 * Tournaments as a table you can filter, sort and scan, with the map beside
 * it. The question it answers is "what can I play in, near me, and when?" —
 * so place and date come first and everything else narrows from there.
 */
export default function TournamentFinder() {
  // In the server-rendered <head>, so the download starts with the JS chunks.
  preload(DATA_PATH, { as: 'fetch', crossOrigin: 'anonymous' });

  const [data, setData] = useState<TournamentData | null>(null);
  const [failed, setFailed] = useState(false);
  const [today, setToday] = useState('');
  const [filters, setFilters] = useState<TFilters>(defaultTFilters);
  const [sort, setSort] = useState<TSort>('date');
  const [descending, setDescending] = useState(false);
  /** True once the URL has been read, so writing it back cannot clobber it. */
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** The tournaments under a pin that holds several, listed on their own until cleared. */
  const [picked, setPicked] = useState<string[] | null>(null);

  const set = useCallback(
    (patch: Partial<TFilters>) => setFilters(current => ({ ...current, ...patch })),
    [],
  );

  useEffect(() => {
    let live = true;
    fetch(DATA_PATH)
      .then(res => {
        if (!res.ok) throw new Error(`${DATA_PATH}: HTTP ${res.status}`);
        return res.json() as Promise<TournamentData>;
      })
      .then(
        loaded => live && setData(loaded),
        err => {
          console.error('Could not load tournaments', err);
          if (live) setFailed(true);
        },
      );
    return () => {
      live = false;
    };
  }, []);

  // Read the URL once, then keep the visitor's local date current.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let next = tFiltersFromParams(params);
    // A bare visit starts from the place used last time. A link that says
    // anything at all is taken at its word.
    if (![...params.keys()].length) next = { ...next, near: readSavedPlace() };
    setFilters(next);
    const sortParam = params.get('sort') as TSort | null;
    if (sortParam && sortParam in SORT_LABELS) {
      setSort(sortParam);
      setDescending(
        params.has('dir') ? params.get('dir') === 'desc' : defaultDescending(sortParam),
      );
    }
    setToday(localDate());
    setReady(true);
    const timer = window.setInterval(() => setToday(localDate()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Distance order needs somewhere to measure from.
  const activeSort: TSort = sort === 'distance' && !filters.near ? 'date' : sort;

  // ─── Listings ───

  const events = useMemo(
    () => (data && today ? data.events.filter(event => isListedEvent(event, today)) : []),
    [data, today],
  );
  const rows = useMemo(() => buildRows(events, filters.near), [events, filters.near]);
  const stateBox = useMemo(
    () =>
      filters.state
        ? boxAround(
            rows
              .filter(row => row.event.state === filters.state && hasPin(row.event))
              .map(row => ({ lat: row.event.lat!, lng: row.event.lng! })),
          )
        : null,
    [rows, filters.state],
  );
  const view = useFinderView(filters, stateBox, data != null);
  const { writeParam, scrollToTop, startAt, scope, panTo } = view;

  useEffect(() => {
    if (!ready) return;
    const params = tFiltersToParams(filters);
    if (activeSort !== 'date') params.set('sort', activeSort);
    if (descending !== defaultDescending(activeSort)) params.set('dir', descending ? 'desc' : 'asc');
    writeParam(params);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    savePlace(filters.near);
  }, [filters, activeSort, descending, writeParam, ready]);

  /** Everything that passes the filters: what the map draws. */
  const matched = useMemo(() => filterRows(rows, filters, today), [rows, filters, today]);
  /** What the table lists: the same, or only what is inside the map's frame. */
  const listed = useMemo(
    () =>
      picked
        ? matched.filter(row => picked.includes(row.event.id))
        : scope
          ? matched.filter(row => withinBounds(row.event, scope))
          : matched,
    [matched, scope, picked],
  );
  const groups = useMemo(
    () => groupRows(sortRows(listed, activeSort, descending, today), activeSort, today),
    [listed, activeSort, descending, today],
  );

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { event } of rows)
      if (!event.online && event.state && STATES[event.state])
        counts.set(event.state, (counts.get(event.state) ?? 0) + 1);
    return counts;
  }, [rows]);

  // A new set of results starts again from the top.
  useEffect(() => {
    setShown(PAGE);
    setPicked(null);
    scrollToTop();
  }, [filters, activeSort, descending, scrollToTop]);

  // ─── Popup ───

  const byId = useMemo(() => new Map(events.map(event => [event.id, event])), [events]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const findByHash = useCallback((hash: string): Item | null => {
    const link = parseItemHash(hash);
    const event = link?.kind === 'tournament' ? byIdRef.current.get(link.id) : undefined;
    return event ? eventItem(event) : null;
  }, []);
  const popup = usePopupHistory<Item>(itemHash, findByHash);
  const { open, openStack, close } = popup;
  const activeId = popup.active?.kind === 'tournament' ? popup.active.id : null;
  const { inline, reveal } = useInlineDetail(view, activeId, close);

  const toggleEvent = useCallback(
    (id: string) => {
      if (activeId === id) return close();
      const event = byIdRef.current.get(id);
      if (!event) return;
      open(eventItem(event));
      if (hasPin(event)) panTo(event.lat, event.lng);
    },
    [activeId, open, close, panTo],
  );

  // A link to one tournament (`#event=…`) opens it on arrival.
  const didDeepLinkRef = useRef(false);
  useEffect(() => {
    if (didDeepLinkRef.current || !events.length) return;
    didDeepLinkRef.current = true;
    const item = findByHash(window.location.hash);
    if (!item || item.kind !== 'tournament') return;
    if (hasPin(item.event)) startAt(item.event.lat, item.event.lng);
    reveal();
    open(item, { replace: true });
  }, [events, findByHash, open, startAt, reveal]);

  // ─── Map ───

  // Tournaments at the same coordinates (most pins mark a ZIP code) share a pin.
  const { pins, pinMembers } = useMemo(() => {
    const members = new Map<string, TRow[]>();
    for (const row of matched) {
      if (!hasPin(row.event)) continue;
      const key = `stack:${coordKey(row.event.lat, row.event.lng)}`;
      const group = members.get(key);
      if (group) group.push(row);
      else members.set(key, [row]);
    }
    const features: Feature<Point, PinProps>[] = [];
    for (const [key, group] of members) {
      const { lat, lng } = group[0].event;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng!, lat!] },
        properties: {
          key,
          kind: 'tournament',
          count: group.length,
          big: group.some(row => isBigEvent(row.event)),
        },
      });
    }
    const collection: FeatureCollection<Point, PinProps> = { type: 'FeatureCollection', features };
    return { pins: collection, pinMembers: members };
  }, [matched]);

  const handlePick = useCallback(
    (keys: string[]) => {
      const group = keys
        .flatMap(key => pinMembers.get(key) ?? [])
        .sort((a, b) => a.event.date.localeCompare(b.event.date))
        .map(row => eventItem(row.event));
      if (group.length === 1) {
        reveal();
        open(group[0]);
      } else if (group.length > 1 && inline) {
        // Most pins mark a ZIP code: list just what is there.
        if (popup.active) close();
        setPicked(group.map(item => item.id));
        scrollToTop();
      } else if (group.length > 1) openStack(group);
    },
    [pinMembers, open, openStack, inline, popup.active, close, reveal, scrollToTop],
  );
  const handleMapClear = useCallback(() => {
    if (popup.active || popup.stack) close();
    setPicked(null);
  }, [popup.active, popup.stack, close]);

  const highlight = useMemo(() => {
    const active = popup.active ?? popup.stack?.[0];
    const event =
      active?.kind === 'tournament' ? active.event : hoverId ? byId.get(hoverId) : undefined;
    return event && hasPin(event)
      ? { lng: event.lng, lat: event.lat, color: KIND_COLORS.tournament }
      : null;
  }, [popup.active, popup.stack, hoverId, byId]);

  // ─── Sorting ───

  const sortBy = useCallback(
    (key: TSort) => {
      if (key === activeSort) setDescending(d => !d);
      else {
        setSort(key);
        setDescending(defaultDescending(key));
      }
    },
    [activeSort],
  );
  /** The "Where" column sorts by distance once there is somewhere to measure from. */
  const placeSort: TSort = filters.near ? 'distance' : 'place';

  const header = (key: TSort, label: string, className?: string) => (
    <th
      scope="col"
      className={className}
      aria-sort={activeSort === key ? (descending ? 'descending' : 'ascending') : undefined}
    >
      <button type="button" className="tf-sort-button" onClick={() => sortBy(key)}>
        {label}
        <span className="tf-sort-arrow" aria-hidden="true">
          {activeSort === key ? (descending ? '↓' : '↑') : ''}
        </span>
      </button>
    </th>
  );

  // ─── Render ───

  const loaded = data != null && today !== '';
  const total = listed.length;
  const filterCount = activeFilterCount(filters);
  const narrowed = filterCount > 0 || !!filters.q.trim() || !!filters.near;
  const where = whereText(filters);
  const scoped = scope != null;
  const { wide, mapVisible } = view;
  const reset = () => {
    setFilters(defaultTFilters);
    view.setAreaOnly(false);
  };

  // Page down to a tournament opened from the map or a link.
  const activeIndex = useMemo(() => {
    if (!activeId) return -1;
    let i = 0;
    for (const group of groups)
      for (const row of group.rows) {
        if (row.event.id === activeId) return i;
        i += 1;
      }
    return -1;
  }, [groups, activeId]);
  useEffect(() => {
    if (activeIndex >= shown) setShown(Math.ceil((activeIndex + 1) / PAGE) * PAGE);
  }, [activeIndex, shown]);
  // A tournament opened from a link but hidden by the filters is shown above the table.
  const strayRow =
    inline && activeId && activeIndex < 0 ? rows.find(row => row.event.id === activeId) : undefined;

  // Fill the page budget group by group, in order.
  let budget = shown;
  const visible = groups.flatMap(group => {
    if (budget <= 0) return [];
    const slice = group.rows.slice(0, budget);
    budget -= slice.length;
    return [{ ...group, count: group.rows.length, rows: slice }];
  });

  return (
    <FinderShell
      section="tournaments"
      view={view}
      search={{
        value: filters.q,
        onChange: q => set({ q }),
        placeholder: 'Tournament, organizer, city…',
        label: 'Search tournaments by name, organizer, city or venue',
      }}
      where={filters}
      onWhere={set}
      stateCounts={stateCounts}
      filterCount={filterCount}
      filters={
        <>
          <div className="filter-group">
            <span className="filter-label">When</span>
            <div className="filter-pills">
              <Chip
                active={filters.when === 'any'}
                onClick={() => set({ when: 'any', from: '', to: '' })}
              >
                Any time
              </Chip>
              {(
                [
                  ['weekend', 'This weekend'],
                  ['30d', 'Next 30 days'],
                  ['90d', 'Next 3 months'],
                ] as const
              ).map(([when, label]) => (
                <Chip
                  key={when}
                  active={filters.when === when}
                  onClick={() =>
                    set({ when: filters.when === when ? 'any' : when, from: '', to: '' })
                  }
                >
                  {label}
                </Chip>
              ))}
              <Chip
                active={filters.when === 'custom'}
                onClick={() =>
                  set(
                    filters.when === 'custom'
                      ? { when: 'any', from: '', to: '' }
                      : { when: 'custom', from: today, to: '' },
                  )
                }
              >
                Dates…
              </Chip>
              {filters.when === 'custom' && (
                <span className="finder-dates">
                  <input
                    type="date"
                    aria-label="From"
                    min={today}
                    max={filters.to || undefined}
                    value={filters.from}
                    onChange={e => set({ from: e.target.value })}
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    type="date"
                    aria-label="To"
                    min={filters.from || today}
                    value={filters.to}
                    onChange={e => set({ to: e.target.value })}
                  />
                </span>
              )}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Play</span>
            <div className="filter-pills">
              {FORMATS.map(format => (
                <Chip
                  key={format}
                  active={filters.formats.includes(format)}
                  activeClass={FORMAT_PILL[format]}
                  onClick={() => set({ formats: toggle(filters.formats, format) })}
                >
                  {FORMAT_LABELS[format]}
                </Chip>
              ))}
              <Chip
                active={filters.fide}
                activeClass="pretty-pill-neutral finder-chip-on"
                onClick={() => set({ fide: !filters.fide })}
              >
                FIDE rated
              </Chip>
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Length</span>
            <div className="filter-pills">
              {LENGTHS.map(length => (
                <Chip
                  key={length}
                  active={filters.lengths.includes(length)}
                  onClick={() => set({ lengths: toggle(filters.lengths, length) })}
                >
                  {LENGTH_LABELS[length]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Prizes</span>
            <div className="filter-pills">
              {PRIZES.map(prize => (
                <Chip
                  key={prize}
                  active={filters.prize === prize}
                  activeClass="pretty-pill-fuchsia"
                  onClick={() => set({ prize: filters.prize === prize ? 0 : prize })}
                  label={`Prize fund of ${dollars(prize)} or more`}
                >
                  {dollars(prize)}+
                </Chip>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">For</span>
            <div className="filter-pills">
              <Chip
                active={filters.audience === 'open'}
                onClick={() => set({ audience: filters.audience === 'open' ? '' : 'open' })}
                label="Open events: leave out scholastic tournaments"
              >
                Adults &amp; open
              </Chip>
              <Chip
                active={filters.audience === 'scholastic'}
                activeClass="pretty-pill-violet"
                onClick={() =>
                  set({ audience: filters.audience === 'scholastic' ? '' : 'scholastic' })
                }
              >
                Scholastic
              </Chip>
              <Chip
                active={filters.mode === 'online'}
                activeClass="pretty-pill-sky"
                onClick={() =>
                  set(
                    filters.mode === 'online'
                      ? { mode: '' }
                      : { mode: 'online', near: null, state: '' },
                  )
                }
              >
                Online
              </Chip>
            </div>
          </div>
        </>
      }
      count={
        loaded ? (
          <>
            <strong>{total.toLocaleString('en-US')}</strong>{' '}
            {total === 1 ? 'tournament' : 'tournaments'}
            <span className="finder-count-where">
              {where ? ` ${where}` : ''}
              {scoped ? ' · in this map area' : ''}
            </span>
          </>
        ) : failed ? (
          'The listings did not load. Refresh to try again.'
        ) : (
          'Setting up the board…'
        )
      }
      narrowed={narrowed}
      onClear={reset}
      sort={{
        value: activeSort,
        options: (Object.keys(SORT_LABELS) as TSort[])
          .filter(key => key !== 'distance' || filters.near)
          .map(key => [key, SORT_LABELS[key]]),
        onChange: key => {
          setSort(key);
          setDescending(defaultDescending(key));
        },
      }}
      pins={pins}
      highlight={highlight}
      onPick={handlePick}
      onMapClear={handleMapClear}
      popup={
        inline && !popup.stack ? null : popup.active ? (
          <DetailPopup
            item={popup.active}
            today={today}
            onClose={popup.close}
            onBack={popup.stack ? popup.backToStack : undefined}
            backLabel={popup.stack ? `All ${popup.stack.length} here` : undefined}
          />
        ) : (
          popup.stack && (
            <StackPopup
              items={popup.stack}
              today={today}
              onSelect={item => popup.open(item, { keepStack: true })}
              onClose={popup.close}
            />
          )
        )
      }
    >
      {picked && (
        <PickedBanner count={picked.length} noun={['tournament', 'tournaments']} onClear={() => setPicked(null)} />
      )}
      <table className="tf-table">
        <thead>
          <tr>
            {header('date', 'Date', 'tf-col-date')}
            {header('name', 'Tournament', 'tf-col-name')}
            {header(placeSort, filters.near ? 'Where · distance' : 'Where', 'tf-col-where')}
            <th scope="col" className="tf-col-format">
              Time control
            </th>
            {header('prize', 'Prizes', 'tf-col-prize')}
            <th scope="col" className="tf-col-fee">
              Entry
            </th>
          </tr>
        </thead>
        {strayRow && (
          <tbody>
            <tr className="tf-group">
              <th colSpan={6} scope="colgroup">
                Linked tournament · not in these filters
              </th>
            </tr>
            <Row row={strayRow} today={today} active expanded onToggle={toggleEvent} />
          </tbody>
        )}
        {visible.map(group => (
          <tbody key={group.key}>
            {group.label && (
              <tr className="tf-group">
                <th colSpan={6} scope="colgroup">
                  {group.label}
                  <span className="tf-group-count">{group.count}</span>
                </th>
              </tr>
            )}
            {group.rows.map(row => (
              <Row
                key={row.event.id}
                row={row}
                today={today}
                active={activeId === row.event.id}
                expanded={inline && activeId === row.event.id}
                onToggle={toggleEvent}
                onHover={wide && mapVisible ? setHoverId : undefined}
              />
            ))}
          </tbody>
        ))}
      </table>
      <ListFooter
        loaded={loaded}
        total={total}
        shown={shown}
        onMore={() => setShown(shown + PAGE)}
        empty={
          <>
            <p>
              {scoped
                ? 'No tournaments in this part of the map match.'
                : filters.near && filters.radius > 0
                  ? `Nothing listed within ${filters.radius} miles that matches.`
                  : 'No tournaments match these filters.'}
            </p>
            <div className="finder-empty-actions">
              {scoped && (
                <button
                  type="button"
                  className="pretty-pill pretty-pill-blue"
                  onClick={() => view.setAreaOnly(false)}
                >
                  Look everywhere
                </button>
              )}
              {!scoped && filters.near && filters.radius > 0 && filters.radius < 250 && (
                <button
                  type="button"
                  className="pretty-pill pretty-pill-blue"
                  onClick={() => set({ radius: filters.radius < 100 ? 100 : 250 })}
                >
                  Widen the search
                </button>
              )}
              <button type="button" className="pretty-pill pretty-pill-ghost" onClick={reset}>
                Clear all filters
              </button>
            </div>
          </>
        }
      >
        Listings come from US Chess, King Registration, NA Chess Hub, ChessReg, Continental Chess
        and regional clubs and associations
        {data?.updatedAt
          ? `, last refreshed ${new Date(data.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}`
          : ''}
        . Entry fees shown are the first price an organizer lists; sections and deadlines change
        them, so confirm on the official page before you travel.{' '}
        <Link href="/events">Browse by state</Link>
      </ListFooter>
    </FinderShell>
  );
}

const Row = memo(function Row({
  row,
  today,
  active,
  expanded,
  onToggle,
  onHover,
}: {
  row: TRow;
  today: string;
  active: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  const { event } = row;
  const end = event.endDate || event.date;
  const started = event.date < today;
  const soon = relativeDay(event.date, today);
  const fee = feeHint(event);
  const place = event.online
    ? 'Online'
    : [event.city, event.state].filter(Boolean).join(', ') || 'Location to be confirmed';
  const fide = event.fideRated || event.ratingSystem === 'FIDE';

  return (
    <>
    <tr
      className={clsx('tf-row', active && 'is-active', expanded && 'is-open')}
      aria-expanded={expanded}
      onClick={() => onToggle(event.id)}
      onMouseEnter={onHover ? () => onHover(event.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      <td className="tf-date">
        <span className="tf-main">{shortDate(event.date, today)}</span>
        <span className="tf-sub">
          {started
            ? `Under way · to ${shortDate(end, today, false)}`
            : row.length === 'series'
              ? `through ${shortDate(end, today, false)}`
              : row.length === 'multi'
                ? `to ${shortDate(end, today)}`
                : soon}
        </span>
      </td>
      <td className="tf-name">
        {/* A real link for search engines and "open in new tab"; a plain
            click opens the details in place. */}
        <a
          className="tf-main"
          href={eventPath(event)}
          onClick={e => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) e.stopPropagation();
            else e.preventDefault();
          }}
        >
          {row.name}
        </a>
        <span className="tf-sub">
          {event.organizer}
          {event.audience === 'scholastic' && <span className="tf-tag tf-tag-violet">Scholastic</span>}
          {isBigEvent(event) && <span className="tf-tag tf-tag-fuchsia">Big event</span>}
        </span>
      </td>
      <td className="tf-where">
        <span className="tf-main">
          {place}
          {row.miles != null && <span className="tf-miles">{formatMiles(row.miles)}</span>}
        </span>
        {!event.online && event.venue && event.venue !== event.city && (
          <span className="tf-sub">{event.venue}</span>
        )}
      </td>
      <td className="tf-format">
        <span className="tf-main tf-pills">
          {row.formats.map(format => (
            <span key={format} className={`pretty-pill ${FORMAT_PILL[format]}`}>
              {FORMAT_LABELS[format]}
            </span>
          ))}
          {fide && <span className="pretty-pill pretty-pill-neutral">FIDE</span>}
        </span>
        {event.timeControl?.raw && <span className="tf-sub">{event.timeControl.raw}</span>}
      </td>
      <td className="tf-prize" data-label="Prizes">
        {row.prize != null ? (
          <span className="tf-main">{dollars(row.prize)}</span>
        ) : (
          <span className="tf-none">—</span>
        )}
      </td>
      <td className="tf-fee" data-label="Entry">
        {fee ? (
          <>
            <span className="tf-main">{fee.amount}</span>
            {fee.varies && <span className="tf-sub">varies</span>}
          </>
        ) : (
          <span className="tf-none">—</span>
        )}
      </td>
    </tr>
    {expanded && (
      <tr className="tf-detail-row">
        <td colSpan={6}>
          <TournamentDetails event={event} today={today} />
        </td>
      </tr>
    )}
    </>
  );
});
