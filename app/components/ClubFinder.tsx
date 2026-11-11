'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { preload } from 'react-dom';
import clsx from 'clsx';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { DayOfWeek } from '@/types/spot';
import {
  DAYS,
  DAY_SHORT,
  KIND_COLORS,
  clubHoursOn,
  clubItem,
  inBounds,
  itemHash,
  itemKey,
  localDate,
  parseItemHash,
  type Item,
} from '@/lib/explore';
import {
  activeClubFilterCount,
  buildClubRows,
  cFiltersFromParams,
  cFiltersToParams,
  defaultCFilters,
  filterClubs,
  groupClubs,
  type CEntry,
  type CFilters,
  type CSort,
} from '@/lib/clubs';
import { formatMiles } from '@/lib/tournaments';
import { STATES } from '@/lib/us-states';
import { GITHUB_URL } from '@/lib/constants';
import type { ExploreData } from '@/app/explore-data.json/route';
import { usePopupHistory } from '@/app/hooks/usePopupHistory';
import type { PinProps } from './ExploreMap';
import Chip from './Chip';
import DetailPopup, { StackPopup } from './DetailPopup';
import FinderShell, {
  ListFooter,
  boxAround,
  readSavedPlace,
  savePlace,
  useFinderView,
} from './FinderShell';

const DATA_PATH = '/explore-data.json';
const PAGE = 120;
const SORT_LABELS: Record<CSort, string> = {
  place: 'By state',
  distance: 'Nearest first',
  week: 'This week, day by day',
  name: 'Name A–Z',
};

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter(x => x !== value) : [...list, value];
const clip = (text: string, length = 150) =>
  text.length > length ? `${text.slice(0, text.lastIndexOf(' ', length))}…` : text;

/**
 * Chess clubs as a list beside the map: say where you are, pick the night you
 * are free, and see who meets. The same page layout as tournaments and
 * coaches, in the clubs' green.
 */
export default function ClubFinder() {
  preload(DATA_PATH, { as: 'fetch', crossOrigin: 'anonymous' });

  const [data, setData] = useState<ExploreData | null>(null);
  const [failed, setFailed] = useState(false);
  const [today, setToday] = useState('');
  const [filters, setFilters] = useState<CFilters>(defaultCFilters);
  const [sortChoice, setSortChoice] = useState<CSort | null>(null);
  /** True once the URL has been read, so writing it back cannot clobber it. */
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const set = useCallback(
    (patch: Partial<CFilters>) => setFilters(current => ({ ...current, ...patch })),
    [],
  );

  useEffect(() => {
    let live = true;
    fetch(DATA_PATH)
      .then(res => {
        if (!res.ok) throw new Error(`${DATA_PATH}: HTTP ${res.status}`);
        return res.json() as Promise<ExploreData>;
      })
      .then(
        loaded => live && setData(loaded),
        err => {
          console.error('Could not load clubs', err);
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
    // Tournament links made before the finder existed pointed at this page.
    const link = parseItemHash(window.location.hash);
    const legacy = params.get('event');
    if (link?.kind === 'tournament' || legacy) {
      window.location.replace(
        `/tournaments#event=${encodeURIComponent(link?.kind === 'tournament' ? link.id : legacy!)}`,
      );
      return;
    }
    let next = cFiltersFromParams(params);
    // A bare visit starts from the place used last time.
    if (![...params.keys()].length) next = { ...next, near: readSavedPlace() };
    setFilters(next);
    const sortParam = params.get('sort') as CSort | null;
    if (sortParam && sortParam in SORT_LABELS) setSortChoice(sortParam);
    setToday(localDate());
    setReady(true);
    const timer = window.setInterval(() => setToday(localDate()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // With a place chosen the natural order is nearest first; without one, by state.
  const sort: CSort =
    sortChoice && (sortChoice !== 'distance' || filters.near)
      ? sortChoice
      : filters.near
        ? 'distance'
        : 'place';

  // ─── Listings ───

  const rows = useMemo(() => buildClubRows(data?.clubs ?? [], filters.near), [data, filters.near]);
  const stateBox = useMemo(
    () =>
      filters.state
        ? boxAround(
            rows
              .filter(row => row.state === filters.state)
              .map(row => ({ lat: row.spot.lat!, lng: row.spot.lng! })),
          )
        : null,
    [rows, filters.state],
  );
  const view = useFinderView(filters, stateBox, data != null);
  const { writeParam, scrollToTop, startAt, scope } = view;

  useEffect(() => {
    if (!ready) return;
    const params = cFiltersToParams(filters);
    if (sortChoice && sortChoice === sort) params.set('sort', sort);
    writeParam(params);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    savePlace(filters.near);
  }, [filters, sortChoice, sort, writeParam, ready]);

  /** Everything that passes the filters: what the map draws. */
  const matched = useMemo(
    () => (today ? filterClubs(rows, filters, today) : []),
    [rows, filters, today],
  );
  /** What the list shows: the same, or only what is inside the map's frame. */
  const listed = useMemo(
    () => (scope ? matched.filter(row => inBounds(clubItem(row.spot), scope)) : matched),
    [matched, scope],
  );
  const groups = useMemo(
    () => groupClubs(listed, sort, filters, today),
    [listed, sort, filters, today],
  );
  const entryCount = useMemo(() => groups.reduce((n, g) => n + g.entries.length, 0), [groups]);

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows)
      if (STATES[row.state]) counts.set(row.state, (counts.get(row.state) ?? 0) + 1);
    return counts;
  }, [rows]);

  // A new set of results starts again from the top.
  useEffect(() => {
    setShown(PAGE);
    scrollToTop();
  }, [filters, sort, scrollToTop]);

  // ─── Popup ───

  const byId = useMemo(() => new Map((data?.clubs ?? []).map(spot => [spot.id, spot])), [data]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const findByHash = useCallback((hash: string): Item | null => {
    const link = parseItemHash(hash);
    const spot = link?.kind === 'club' ? byIdRef.current.get(link.id) : undefined;
    return spot ? clubItem(spot) : null;
  }, []);
  const popup = usePopupHistory<Item>(itemHash, findByHash);
  const { open, openStack, close } = popup;

  const openClub = useCallback(
    (id: string) => {
      const spot = byIdRef.current.get(id);
      if (spot) open(clubItem(spot));
    },
    [open],
  );

  // A link to one club (`#club=…`) opens it on arrival.
  const didDeepLinkRef = useRef(false);
  useEffect(() => {
    if (didDeepLinkRef.current || !data) return;
    didDeepLinkRef.current = true;
    const item = findByHash(window.location.hash);
    if (!item || item.kind !== 'club') return;
    startAt(item.spot.lat!, item.spot.lng!);
    open(item, { replace: true });
  }, [data, findByHash, open, startAt]);

  // ─── Map ───

  const pins = useMemo(() => {
    const features: Feature<Point, PinProps>[] = matched.map(row => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.spot.lng!, row.spot.lat!] },
      properties: { key: itemKey(clubItem(row.spot)), kind: 'club', count: 1, big: false },
    }));
    const collection: FeatureCollection<Point, PinProps> = { type: 'FeatureCollection', features };
    return collection;
  }, [matched]);

  const handlePick = useCallback(
    (keys: string[]) => {
      const group = keys
        .map(key => byIdRef.current.get(key.replace(/^club:/, '')))
        .filter(spot => spot != null)
        .map(clubItem);
      if (group.length === 1) open(group[0]);
      else if (group.length > 1) openStack(group);
    },
    [open, openStack],
  );
  const handleMapClear = useCallback(() => {
    if (popup.active || popup.stack) close();
  }, [popup.active, popup.stack, close]);

  const highlight = useMemo(() => {
    const active = popup.active ?? popup.stack?.[0];
    const spot = active?.kind === 'club' ? active.spot : hoverId ? byId.get(hoverId) : undefined;
    return spot?.lat != null && spot.lng != null
      ? { lng: spot.lng, lat: spot.lat, color: KIND_COLORS.club }
      : null;
  }, [popup.active, popup.stack, hoverId, byId]);

  // ─── Render ───

  const loaded = data != null && today !== '';
  const total = listed.length;
  const narrowed = activeClubFilterCount(filters) > 0 || !!filters.q.trim() || !!filters.near;
  const where = filters.near
    ? filters.radius > 0
      ? `within ${filters.radius} mi of ${filters.near.label}`
      : `nearest ${filters.near.label}`
    : filters.state
      ? `in ${STATES[filters.state]}`
      : '';
  const reset = () => {
    setFilters(defaultCFilters);
    view.setAreaOnly(false);
  };

  // Fill the page budget group by group, in order.
  let budget = shown;
  const visible = groups.flatMap(group => {
    if (budget <= 0) return [];
    const slice = group.entries.slice(0, budget);
    budget -= slice.length;
    return [{ ...group, count: group.entries.length, entries: slice }];
  });

  return (
    <FinderShell
      section="clubs"
      view={view}
      search={{
        value: filters.q,
        onChange: q => set({ q }),
        placeholder: 'Club, city, neighbourhood…',
        label: 'Search clubs by name, city or address',
      }}
      where={filters}
      onWhere={set}
      stateCounts={stateCounts}
      filterCount={activeClubFilterCount(filters)}
      filters={
        <>
          <div className="filter-group">
            <span className="filter-label">Meets</span>
            <div className="filter-pills">
              <Chip
                active={filters.when === 'any' && filters.days.length === 0}
                activeClass="pretty-pill-green"
                onClick={() => set({ when: 'any', days: [] })}
              >
                Any day
              </Chip>
              <Chip
                active={filters.when === 'today'}
                activeClass="pretty-pill-green"
                onClick={() => set({ when: filters.when === 'today' ? 'any' : 'today' })}
              >
                Today
              </Chip>
              <Chip
                active={filters.when === 'weekend'}
                activeClass="pretty-pill-green"
                onClick={() => set({ when: filters.when === 'weekend' ? 'any' : 'weekend' })}
              >
                This weekend
              </Chip>
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Day</span>
            <div className="filter-pills">
              {DAYS.map(day => (
                <Chip
                  key={day}
                  active={filters.days.includes(day)}
                  activeClass="pretty-pill-green"
                  onClick={() => set({ days: toggle(filters.days, day) })}
                  label={day}
                >
                  {DAY_SHORT[day]}
                </Chip>
              ))}
            </div>
          </div>
        </>
      }
      count={
        loaded ? (
          <>
            <strong>{total.toLocaleString('en-US')}</strong> {total === 1 ? 'club' : 'clubs'}
            <span className="finder-count-where">
              {where ? ` ${where}` : ''}
              {scope ? ' · in this map area' : ''}
            </span>
          </>
        ) : failed ? (
          'The clubs did not load. Refresh to try again.'
        ) : (
          'Setting up the board…'
        )
      }
      narrowed={narrowed}
      onClear={reset}
      sort={{
        value: sort,
        options: (Object.keys(SORT_LABELS) as CSort[])
          .filter(key => key !== 'distance' || filters.near)
          .map(key => [key, SORT_LABELS[key]]),
        onChange: setSortChoice,
      }}
      barExtra={
        <Link href="/club_submission" className="pretty-pill pretty-pill-ghost finder-bar-extra">
          + Suggest a club
        </Link>
      }
      pins={pins}
      highlight={highlight}
      onPick={handlePick}
      onMapClear={handleMapClear}
      popup={
        popup.active ? (
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
      {visible.map(group => (
        <section key={group.key}>
          {group.label && (
            <h2 className="lf-section">
              {group.label}
              <span>{group.count}</span>
            </h2>
          )}
          <ul className="lf-list">
            {group.entries.map(entry => (
              <Card
                key={entry.key}
                entry={entry}
                active={popup.active?.kind === 'club' && popup.active.id === entry.row.spot.id}
                onOpen={openClub}
                onHover={view.wide && view.mapVisible ? setHoverId : undefined}
              />
            ))}
          </ul>
        </section>
      ))}

      <ListFooter
        loaded={loaded}
        total={entryCount}
        shown={shown}
        onMore={() => setShown(shown + PAGE)}
        empty={
          <>
            <p>
              {scope
                ? 'No clubs in this part of the map match.'
                : filters.near && filters.radius > 0
                  ? `No club listed within ${filters.radius} miles matches.`
                  : 'No clubs match these filters.'}
            </p>
            <div className="finder-empty-actions">
              {scope && (
                <button
                  type="button"
                  className="pretty-pill pretty-pill-green"
                  onClick={() => view.setAreaOnly(false)}
                >
                  Look everywhere
                </button>
              )}
              {!scope && filters.near && filters.radius > 0 && filters.radius < 250 && (
                <button
                  type="button"
                  className="pretty-pill pretty-pill-green"
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
        Clubs are checked by hand: an active club with a regular night gets a pin. Know one that is
        missing? <Link href="/club_submission">Suggest a club</Link>
        {' · '}
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </ListFooter>
    </FinderShell>
  );
}

const Card = memo(function Card({
  entry,
  active,
  onOpen,
  onHover,
}: {
  entry: CEntry;
  active: boolean;
  onOpen: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  const { row, day } = entry;
  const { spot } = row;
  // Without a town to name, the address says more than a bare state.
  const place = row.city ? [row.city, row.state].filter(Boolean).join(', ') : spot.address || row.state;
  const time = (on: DayOfWeek) => clubHoursOn(spot, on).replace(/^from /, '');
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        className={clsx('lf-card', active && 'is-active')}
        onClick={() => onOpen(spot.id)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(spot.id);
          }
        }}
        onMouseEnter={onHover ? () => onHover(spot.id) : undefined}
        onMouseLeave={onHover ? () => onHover(null) : undefined}
      >
        <h3 className="lf-name">{spot.name}</h3>
        <span className="lf-place">
          {place}
          {row.miles != null && <span className="tf-miles">{formatMiles(row.miles)}</span>}
        </span>
        <div className="lf-pills">
          {row.days.length === 0 && (
            <span className="pretty-pill pretty-pill-ghost">Ask for meeting times</span>
          )}
          {row.days.map(on => (
            <span
              key={on}
              className={clsx(
                'pretty-pill',
                on === day ? 'pretty-pill-green' : 'pretty-pill-neutral',
              )}
            >
              {DAY_SHORT[on]}
              {time(on) && <span className="lf-time">{time(on)}</span>}
            </span>
          ))}
          {spot.seasonal && <span className="pretty-pill pretty-pill-amber">{spot.seasonal}</span>}
        </div>
        {spot.notes && <p className="lf-desc">{clip(spot.notes)}</p>}
      </div>
    </li>
  );
});
