'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import clsx from 'clsx';
import type { MapRef } from 'react-map-gl/maplibre';
import type { FeatureCollection, Point } from 'geojson';
import type { Bounds } from '@/lib/explore';
import { RADII, type Near } from '@/lib/tournaments';
import { STATES } from '@/lib/us-states';
import type { MapViewState, PinProps } from './ExploreMap';
import Chip from './Chip';
import Icon from './Icon';
import PlaceInput from './PlaceInput';
import SiteNav, { type Section } from './SiteNav';

// maplibre-gl is about 1 MB; the list works while it is still on the wire.
const ExploreMap = dynamic(() => import('./ExploreMap'), { ssr: false, loading: () => null });

const WIDE = '(min-width: 900px)';
const US_BOUNDS: [[number, number], [number, number]] = [
  [-124.8, 24.5],
  [-66.9, 49.4],
];
/** How far out the map sits for each "within N miles". */
const RADIUS_ZOOM: Record<number, number> = { 25: 9, 50: 8, 100: 7, 250: 5.6, 0: 5 };

/** The filled pill colour of each section: its pins, its tab, its chips. */
export const SECTION_PILL: Record<Section, string> = {
  clubs: 'pretty-pill-green',
  tournaments: 'pretty-pill-blue',
  learn: 'pretty-pill-violet',
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── The visitor's place, shared by every page ───

/** Say where you are once: all three pages start from the place used last. */
const PLACE_KEY = 'chesshotspot:place';

export type Where = {
  near: Near | null;
  /** Miles from `near`; 0 measures and sorts without a cut-off. */
  radius: number;
  /** Two-letter state code; used instead of `near`, never with it. */
  state: string;
};

export function readSavedPlace(): Near | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PLACE_KEY) || 'null') as {
      near?: Near;
    } | null;
    const near = saved?.near;
    return near && Number.isFinite(near.lat) && Number.isFinite(near.lng) ? near : null;
  } catch {
    // Private browsing, or a value from an older version: start fresh.
    return null;
  }
}

export function savePlace(near: Near | null) {
  try {
    if (near) window.localStorage.setItem(PLACE_KEY, JSON.stringify({ near }));
    else window.localStorage.removeItem(PLACE_KEY);
  } catch {
    // Storage is a convenience; the page works without it.
  }
}

/** Corners of the box around some points, for framing a state. */
export function boxAround(
  points: { lat: number; lng: number }[],
): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  const lngs = points.map(p => p.lng);
  const lats = points.map(p => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// ─── Map state ───

export type FinderView = ReturnType<typeof useFinderView>;

/**
 * Everything about the map pane that is the same on every page: whether it is
 * showing, where it is looking, and whether the list follows its frame.
 *
 * `stateBox` frames the chosen state; pass null while the listings are still
 * loading and the camera waits for it.
 */
export function useFinderView(
  where: Where,
  stateBox: [[number, number], [number, number]] | null,
  loaded: boolean,
) {
  const mapRef = useRef<MapRef>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Null until the browser says how wide it is. */
  const [wide, setWide] = useState<boolean | null>(null);
  /** The visitor's own choice of map on or off; null follows the screen size. */
  const [mapChoice, setMapChoice] = useState<boolean | null>(null);
  const mapVisible = mapChoice ?? wide ?? false;
  const [mapReady, setMapReady] = useState(false);
  /** Last camera, so the map comes back where it was after being hidden. */
  const viewRef = useRef<MapViewState | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [areaOnly, setAreaOnly] = useState(false);

  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get('view');
    if (view === 'map') setMapChoice(true);
    if (view === 'list') setMapChoice(false);
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Choosing a place or a state takes the map there.
  const { near, radius, state } = where;
  const cameraKey = `${near ? `${near.lat},${near.lng},${radius}` : ''}|${state}`;
  const cameraRef = useRef('|');
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || cameraKey === cameraRef.current) return;
    const duration = reducedMotion() ? 0 : 900;
    if (near) {
      map.flyTo({ center: [near.lng, near.lat], zoom: RADIUS_ZOOM[radius] ?? 7, duration });
    } else if (state) {
      if (stateBox) map.fitBounds(stateBox, { padding: 70, maxZoom: 9, duration });
      else if (!loaded) return; // still loading: try again when the listings arrive
    } else {
      map.fitBounds(US_BOUNDS, { padding: 28, duration });
    }
    cameraRef.current = cameraKey;
  }, [cameraKey, mapReady, near, radius, state, stateBox, loaded]);

  const toggleMap = useCallback(() => {
    // The map unmounts when hidden; its `onLoad` flips this back.
    setMapReady(false);
    setMapChoice(!mapVisible);
  }, [mapVisible]);
  const onMapLoad = useCallback(() => setMapReady(true), []);
  const onMove = useCallback((view: MapViewState, next: Bounds) => {
    viewRef.current = view;
    setBounds(next);
  }, []);
  /** Open on this point if the map has not been anywhere yet (a deep link). */
  const startAt = useCallback((lat: number, lng: number) => {
    viewRef.current ??= { longitude: lng, latitude: lat, zoom: 10 };
  }, []);
  /** Adds `view=` to a page's query string when the visitor chose map or list. */
  const writeParam = useCallback(
    (params: URLSearchParams) => {
      if (mapChoice != null) params.set('view', mapChoice ? 'map' : 'list');
    },
    [mapChoice],
  );
  const scrollToTop = useCallback(() => listRef.current?.scrollTo({ top: 0 }), []);

  const scoped = areaOnly && mapVisible && bounds != null;
  return {
    mapRef,
    listRef,
    wide,
    mapChoice,
    mapVisible,
    toggleMap,
    onMapLoad,
    onMove,
    viewRef,
    startAt,
    writeParam,
    scrollToTop,
    areaOnly,
    setAreaOnly,
    /** The map's frame while "list only what is on the map" is on, else null. */
    scope: scoped ? bounds : null,
  };
}

// ─── Layout ───

type Props<S extends string> = {
  section: Section;
  view: FinderView;
  search: { value: string; onChange: (value: string) => void; placeholder: string; label: string };
  where: Where;
  onWhere: (patch: Partial<Where>) => void;
  /** Listings per state, for the state menu. */
  stateCounts: Map<string, number>;
  /** How many filters are on, for the phone's "Filters · 3" button. */
  filterCount: number;
  /** The rows of filter pills. */
  filters: ReactNode;
  /** "128 tournaments within 100 mi of Boston", or a loading line. */
  count: ReactNode;
  /** True when anything narrows the list, to offer "Clear all". */
  narrowed: boolean;
  onClear: () => void;
  sort: { value: S; options: [S, string][]; onChange: (value: S) => void };
  /** Extra buttons for the count bar, shown on wide screens. */
  barExtra?: ReactNode;
  /** The list itself. */
  children: ReactNode;
  pins: FeatureCollection<Point, PinProps>;
  highlight: { lng: number; lat: number; color: string } | null;
  onPick: (keys: string[]) => void;
  onMapClear: () => void;
  /** The open detail card, if any. */
  popup: ReactNode;
};

/**
 * The one page layout: the brand and the three sections across the top,
 * search and filters under it, then the list with the map beside it. On a
 * phone the list fills the screen and a floating button swaps it for the map.
 */
export default function FinderShell<S extends string>({
  section,
  view,
  search,
  where,
  onWhere,
  stateCounts,
  filterCount,
  filters,
  count,
  narrowed,
  onClear,
  sort,
  barExtra,
  children,
  pins,
  highlight,
  onPick,
  onMapClear,
  popup,
}: Props<S>) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pill = SECTION_PILL[section];

  return (
    <div className={`finder finder-${section}`} data-map={view.mapVisible ? 'on' : 'off'}>
      <header className="finder-top">
        <Link href="/" className="finder-brand" aria-label="Chess Hotspot home">
          ♞<span className="finder-brand-text"> chess hotspot</span>
        </Link>
        <SiteNav current={section} />
      </header>

      <div className="finder-controls">
        <div className="finder-search-row">
          <div className="finder-search">
            <span className="finder-search-icon">
              <Icon name="search" size={15} />
            </span>
            <input
              type="search"
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              aria-label={search.label}
            />
          </div>
          <button
            type="button"
            className={clsx(
              'pretty-pill finder-filters-toggle',
              filterCount ? pill : 'pretty-pill-neutral',
            )}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Icon name="filter" size={14} />
            Filters{filterCount ? ` · ${filterCount}` : ''}
          </button>
          <PlaceInput
            value={where.near}
            onChange={near => onWhere(near ? { near, state: '' } : { near: null })}
          />
          <select
            className="finder-select"
            aria-label="State"
            value={where.state}
            onChange={e =>
              onWhere({ state: e.target.value, ...(e.target.value ? { near: null } : {}) })
            }
          >
            <option value="">Any state</option>
            {Object.entries(STATES)
              .filter(([code]) => stateCounts.has(code) || code === where.state)
              .map(([code, name]) => (
                <option key={code} value={code}>
                  {name} ({stateCounts.get(code) ?? 0})
                </option>
              ))}
          </select>
        </div>

        {where.near && (
          <div className="filter-group finder-radius">
            <span className="filter-label">Within</span>
            <div className="filter-pills">
              {RADII.map(radius => (
                <Chip
                  key={radius}
                  active={where.radius === radius}
                  activeClass={pill}
                  onClick={() => onWhere({ radius })}
                >
                  {radius ? `${radius} mi` : 'Any distance'}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className={clsx('finder-filters', filtersOpen && 'is-open')}>{filters}</div>
      </div>

      <div className="finder-bar">
        <p className="finder-count" role="status">
          {count}
        </p>
        {narrowed && (
          <button type="button" className="finder-clear" onClick={onClear}>
            Clear all
          </button>
        )}
        {barExtra}
        <label className="finder-sort">
          <Icon name="sort" size={14} />
          <span className="sr-only">Sort by</span>
          <select value={sort.value} onChange={e => sort.onChange(e.target.value as S)}>
            {sort.options.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="pretty-pill pretty-pill-neutral finder-view-toggle"
          onClick={view.toggleMap}
        >
          <Icon name={view.mapVisible ? 'feed' : 'map'} size={14} />
          {view.mapVisible ? (view.wide ? 'Hide map' : 'List') : 'Map'}
        </button>
      </div>

      <div className="finder-body">
        <div ref={view.listRef as RefObject<HTMLDivElement>} className="finder-list">
          {children}
        </div>

        {view.mapVisible && (
          <div className="finder-map">
            <ExploreMap
              ref={view.mapRef}
              initialView={view.viewRef.current}
              pins={pins}
              highlight={highlight}
              onPick={onPick}
              onClear={onMapClear}
              onLoad={view.onMapLoad}
              onMove={view.onMove}
            />
            <button
              type="button"
              className={clsx(
                'pretty-pill finder-area-toggle',
                view.areaOnly ? pill : 'pretty-pill-ghost',
              )}
              aria-pressed={view.areaOnly}
              onClick={() => view.setAreaOnly(!view.areaOnly)}
            >
              <Icon name={view.areaOnly ? 'check' : 'map'} size={14} />
              List only what is on the map
            </button>
          </div>
        )}
      </div>

      {popup}
    </div>
  );
}

/** "Show more", the empty state and the footnote under every list. */
export function ListFooter({
  loaded,
  total,
  shown,
  onMore,
  empty,
  children,
}: {
  loaded: boolean;
  total: number;
  shown: number;
  onMore: () => void;
  /** What to say, and offer, when nothing matches. */
  empty: ReactNode;
  /** Where the listings come from. */
  children: ReactNode;
}) {
  return (
    <>
      {total > shown && (
        <button type="button" className="pretty-pill pretty-pill-neutral feed-more" onClick={onMore}>
          Show more · {total - shown} to go
        </button>
      )}
      {loaded && total === 0 && <div className="feed-empty">{empty}</div>}
      {loaded && <p className="feed-footnote">{children}</p>}
    </>
  );
}
