'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { preload } from 'react-dom';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Feature, FeatureCollection, Point } from 'geojson';
import {
  KIND_COLORS,
  clubItem,
  coordKey,
  defaultFilters,
  eventItem,
  filtersFromParams,
  filtersToParams,
  hasPin,
  inBounds,
  isBigEvent,
  isListedEvent,
  itemCoords,
  itemHash,
  itemKey,
  itemMatches,
  localDate,
  parseItemHash,
  type Bounds,
  type Filters,
  type Item,
  type Kind,
} from '@/lib/explore';
import type { ChessEvent } from '@/types/event';
import type { ExploreData } from '@/app/explore-data.json/route';
import type { TournamentData } from '@/app/tournaments-data.json/route';
import type { MapViewState, PinProps } from './ExploreMap';
import DetailPopup, { StackPopup } from './DetailPopup';
import FeedView from './FeedView';
import FilterBar from './FilterBar';
import SearchBox from './SearchBox';
import SiteNav from './SiteNav';

// maplibre-gl is about 1 MB and touches `window` on import. Loading it lazily
// keeps it out of the chunks React needs to hydrate, so the search box, the
// filters and a deep-linked popup all work while the map is still on the wire.
const ExploreMap = dynamic(() => import('./ExploreMap'), { ssr: false, loading: () => null });

const CLUBS_PATH = '/explore-data.json';
const EVENTS_PATH = '/tournaments-data.json';

/** Zoomed in at least this far, the feed opens on "what is in this map area". */
const AREA_ZOOM = 6;

type Loaded = { clubs: ExploreData['clubs']; events: ChessEvent[]; updatedAt: string | null };

/** One request per file per page load, shared by every caller. */
const requests = new Map<string, Promise<unknown>>();
function fetchJson<T>(path: string): Promise<T> {
  let request = requests.get(path) as Promise<T> | undefined;
  if (!request) {
    request = fetch(path).then(res => {
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return res.json() as Promise<T>;
    });
    // Let the next mount try again after a failure.
    request.catch(() => requests.delete(path));
    requests.set(path, request);
  }
  return request;
}

/** Clubs always; tournaments only on a page that shows them. */
async function fetchData(withEvents: boolean): Promise<Loaded> {
  const [clubs, tournaments] = await Promise.all([
    fetchJson<ExploreData>(CLUBS_PATH),
    withEvents ? fetchJson<TournamentData>(EVENTS_PATH) : null,
  ]);
  return {
    clubs: clubs.clubs,
    events: tournaments?.events ?? [],
    updatedAt: tournaments?.updatedAt ?? null,
  };
}

/** History state written by a popup so Back closes it instead of leaving the site. */
type PopupHistoryState = { popup?: boolean } | null;

/** Close enough to see the block for an exact address; the town for a ZIP-code pin. */
const focusZoom = (item: Item) =>
  item.kind === 'club' || item.event.locationPrecision === 'venue' ? 13 : 11;

const urlWithoutHash = () => window.location.pathname + window.location.search;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Props = {
  /** Show only this kind: the home page and /clubs are the club map. */
  only?: Kind;
};

/**
 * The map on one screen: every club (and, on a page that asks for them, every
 * tournament), a floating search box, and one bar of filter pills. The Feed
 * button turns the same listings into a dated list.
 */
export default function Explore({ only }: Props) {
  const withEvents = only !== 'club';
  // In the server-rendered <head>, so the download starts with the JS chunks.
  preload(CLUBS_PATH, { as: 'fetch', crossOrigin: 'anonymous' });
  if (withEvents) preload(EVENTS_PATH, { as: 'fetch', crossOrigin: 'anonymous' });

  /** What this page shows before anyone touches a filter. */
  const baseFilters = useMemo<Filters>(
    () => (only ? { ...defaultFilters, kinds: [only] } : defaultFilters),
    [only],
  );

  const mapRef = useRef<MapRef>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [today, setToday] = useState('');
  const [filters, setFilters] = useState<Filters>(baseFilters);
  /** True once the URL has been read, so writing it back cannot clobber it. */
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'feed'>('map');

  const [active, setActive] = useState<Item | null>(null);
  /** Listings sharing the pin that was tapped. Kept while one of them is open. */
  const [stack, setStack] = useState<Item[] | null>(null);

  const [mapReady, setMapReady] = useState(false);
  /** Last camera, so the map comes back where it was after a trip to the feed. */
  const viewRef = useRef<MapViewState | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [areaScoped, setAreaScoped] = useState(false);
  /** Listing to fly to once the map is ready: the last one opened from the feed. */
  const pendingFlyRef = useRef<Item | null>(null);
  /** Same, without the animation: a listing the visitor arrived on by link. */
  const pendingJumpRef = useRef<Item | null>(null);

  useEffect(() => {
    let live = true;
    fetchData(withEvents).then(
      loaded => live && setData(loaded),
      err => console.error('Could not load listings', err),
    );
    return () => {
      live = false;
    };
  }, [withEvents]);

  // Read the URL once, then keep the visitor's local date current.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilters(filtersFromParams(params, baseFilters));
    if (params.get('view') === 'feed') setViewMode('feed');
    setToday(localDate());
    setReady(true);
    const timer = window.setInterval(() => setToday(localDate()), 60000);
    return () => window.clearInterval(timer);
  }, [baseFilters]);

  useEffect(() => {
    if (!ready) return;
    const params = filtersToParams(filters, baseFilters);
    if (viewMode === 'feed') params.set('view', 'feed');
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, [filters, viewMode, ready, baseFilters]);

  // ─── Listings ───

  const items = useMemo<Item[]>(() => {
    if (!data || !today) return [];
    return [
      ...data.clubs.map(clubItem),
      ...data.events.filter(event => isListedEvent(event, today)).map(eventItem),
    ];
  }, [data, today]);

  const itemsByKey = useMemo(() => new Map(items.map(item => [itemKey(item), item])), [items]);

  const filtered = useMemo(
    () => items.filter(item => itemMatches(item, filters, today)),
    [items, filters, today],
  );

  // One pin per club; tournaments at the same coordinates share a pin.
  const { pins, pinMembers } = useMemo(() => {
    const members = new Map<string, Item[]>();
    const features: Feature<Point, PinProps>[] = [];
    for (const item of filtered) {
      if (item.kind === 'club') {
        const key = itemKey(item);
        members.set(key, [item]);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [item.spot.lng!, item.spot.lat!] },
          properties: { key, kind: 'club', count: 1, big: false },
        });
      } else if (hasPin(item.event)) {
        const key = `stack:${coordKey(item.event.lat, item.event.lng)}`;
        const group = members.get(key);
        if (group) group.push(item);
        else members.set(key, [item]);
      }
    }
    for (const [key, group] of members) {
      const first = group[0];
      if (first.kind !== 'tournament') continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [first.event.lng!, first.event.lat!] },
        properties: {
          key,
          kind: 'tournament',
          count: group.length,
          big: group.some(member => member.kind === 'tournament' && isBigEvent(member.event)),
        },
      });
    }
    const collection: FeatureCollection<Point, PinProps> = { type: 'FeatureCollection', features };
    return { pins: collection, pinMembers: members };
  }, [filtered]);

  const feedItems = useMemo(
    () => (areaScoped && bounds ? filtered.filter(item => inBounds(item, bounds)) : filtered),
    [filtered, areaScoped, bounds],
  );

  // ─── Popup + history ───

  const flyTo = useCallback((item: Item, instant = false) => {
    const at = itemCoords(item);
    if (!at) return;
    mapRef.current?.flyTo({
      center: at,
      zoom: focusZoom(item),
      duration: instant || reducedMotion() ? 0 : 1200,
    });
  }, []);

  /**
   * Open a popup and put the listing in the URL.
   *
   * Opening from a closed state pushes a history entry, so a phone's Back
   * gesture closes the popup instead of leaving the site; moving between
   * popups replaces that entry, so Back still lands on the bare map. `replace`
   * is for arriving by deep link: there is nothing to go back to.
   */
  const pushPopup = useCallback((url: string, replace = false) => {
    const state = window.history.state as PopupHistoryState;
    if (replace) window.history.replaceState(null, '', url);
    else if (state?.popup) window.history.replaceState({ popup: true }, '', url);
    else window.history.pushState({ popup: true }, '', url);
  }, []);

  const openItem = useCallback(
    (item: Item, opts: { replace?: boolean; keepStack?: boolean } = {}) => {
      setActive(item);
      if (!opts.keepStack) setStack(null);
      pushPopup(urlWithoutHash() + itemHash(item), opts.replace);
    },
    [pushPopup],
  );

  const openStack = useCallback(
    (group: Item[]) => {
      setActive(null);
      setStack(group);
      pushPopup(urlWithoutHash());
    },
    [pushPopup],
  );

  const closePopup = useCallback(() => {
    setActive(null);
    setStack(null);
    const state = window.history.state as PopupHistoryState;
    // Our own entry is popped (the listener below is a no-op by then); a deep
    // link or reload has no entry of ours, so just drop the hash.
    if (state?.popup) window.history.back();
    else window.history.replaceState(null, '', urlWithoutHash());
  }, []);

  /** From one listing back to the "several things here" list it came from. */
  const backToStack = useCallback(() => {
    setActive(null);
    window.history.replaceState(window.history.state, '', urlWithoutHash());
  }, []);

  // Back closes the popup; Forward reopens it from the hash its entry carries.
  // The history has already moved, so only state changes here.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const state = e.state as PopupHistoryState;
      const link = state?.popup ? parseItemHash(window.location.hash) : null;
      setActive((link && itemsByKey.get(`${link.kind}:${link.id}`)) || null);
      setStack(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [itemsByKey]);

  /** If the filters would hide this listing, clear them rather than show a popup with no pin. */
  const ensureVisible = useCallback(
    (item: Item) => {
      if (!itemMatches(item, filters, today)) setFilters(baseFilters);
    },
    [filters, today, baseFilters],
  );

  // A link to one listing (`#club=…`, `#event=…`, or the older `?event=…`)
  // opens it on arrival. Runs once, after the listings have loaded.
  const didDeepLinkRef = useRef(false);
  useEffect(() => {
    if (didDeepLinkRef.current || !items.length) return;
    didDeepLinkRef.current = true;
    const legacy = new URLSearchParams(window.location.search).get('event');
    const link =
      parseItemHash(window.location.hash) ??
      (legacy ? { kind: 'tournament' as const, id: legacy } : null);
    // Tournament links made before the finder existed pointed at this map.
    if (link?.kind === 'tournament' && !withEvents) {
      window.location.replace(`/tournaments#event=${encodeURIComponent(link.id)}`);
      return;
    }
    const item = link && itemsByKey.get(`${link.kind}:${link.id}`);
    if (!item) return;
    ensureVisible(item);
    const at = itemCoords(item);
    if (at) {
      // If the map has not mounted yet it can simply open on the listing.
      // If it has (or is half-way through loading), it jumps there once ready.
      viewRef.current = { longitude: at[0], latitude: at[1], zoom: focusZoom(item) };
      if (mapReady) flyTo(item, true);
      else pendingJumpRef.current = item;
    }
    openItem(item, { replace: true });
  }, [items, itemsByKey, ensureVisible, flyTo, openItem, mapReady, withEvents]);

  // ─── Handlers ───

  const handlePick = useCallback(
    (keys: string[]) => {
      // Dated things first, soonest at the top; clubs after.
      const group = keys
        .flatMap(key => pinMembers.get(key) ?? [])
        .sort(
          (a, b) =>
            Number(a.kind === 'club') - Number(b.kind === 'club') ||
            (a.kind === 'tournament' && b.kind === 'tournament'
              ? a.event.date.localeCompare(b.event.date)
              : 0),
        );
      if (group.length === 1) openItem(group[0]);
      else if (group.length > 1) openStack(group);
    },
    [pinMembers, openItem, openStack],
  );

  const handleClear = useCallback(() => {
    if (active || stack) closePopup();
  }, [active, stack, closePopup]);

  const handleSearchItem = useCallback(
    (item: Item) => {
      ensureVisible(item);
      flyTo(item);
      openItem(item);
    },
    [ensureVisible, flyTo, openItem],
  );

  const handleSearchPlace = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 10, duration: reducedMotion() ? 0 : 1200 });
  }, []);

  const handleMove = useCallback((view: MapViewState, next: Bounds) => {
    viewRef.current = view;
    setBounds(next);
  }, []);

  const toggleView = useCallback(() => {
    if (viewMode === 'feed') return setViewMode('map');
    // Looking at one region? Then that is what the list should be about.
    setAreaScoped((viewRef.current?.zoom ?? 0) >= AREA_ZOOM);
    // The map unmounts in the feed; its `onLoad` flips this back.
    setMapReady(false);
    setViewMode('feed');
  }, [viewMode]);

  // Once the map has (re)loaded, go to whatever was waiting for it.
  useEffect(() => {
    if (!mapReady) return;
    const jump = pendingJumpRef.current;
    const fly = pendingFlyRef.current;
    pendingJumpRef.current = pendingFlyRef.current = null;
    if (jump) flyTo(jump, true);
    else if (fly) flyTo(fly);
  }, [mapReady, flyTo]);

  const highlight = useMemo(() => {
    const target = active ?? stack?.[0];
    const at = target && itemCoords(target);
    return at && target ? { lng: at[0], lat: at[1], color: KIND_COLORS[target.kind] } : null;
  }, [active, stack]);

  const loaded = data != null && today !== '';

  return (
    <div className="explore">
      {viewMode === 'map' ? (
        <>
          <div className="explore-map">
            <div className="explore-top">
              <SearchBox
                items={items}
                today={today}
                only={only}
                onSelectItem={handleSearchItem}
                onSelectPlace={handleSearchPlace}
              />
              <SiteNav current="clubs" />
            </div>
            <ExploreMap
              ref={mapRef}
              initialView={viewRef.current}
              pins={pins}
              highlight={highlight}
              onPick={handlePick}
              onClear={handleClear}
              onLoad={() => setMapReady(true)}
              onMove={handleMove}
            />
            {loaded && pins.features.length === 0 && (
              <div className="explore-empty" role="status">
                <p>Nothing on the map matches these filters.</p>
                <button
                  type="button"
                  className="pretty-pill pretty-pill-green"
                  onClick={() => setFilters(baseFilters)}
                >
                  Show everything
                </button>
              </div>
            )}
          </div>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            today={today}
            only={only}
            viewMode="map"
            onViewModeToggle={toggleView}
          />
        </>
      ) : (
        <FeedView
          items={feedItems}
          filters={filters}
          onFiltersChange={setFilters}
          today={today}
          only={only}
          area={{ scoped: areaScoped && bounds != null, onChange: setAreaScoped }}
          loaded={loaded}
          updatedAt={data?.updatedAt ?? null}
          onSelect={item => {
            pendingFlyRef.current = item;
            openItem(item);
          }}
          onClose={toggleView}
        />
      )}

      {active ? (
        <DetailPopup
          item={active}
          today={today}
          onClose={closePopup}
          onBack={stack ? backToStack : undefined}
          backLabel={stack ? `All ${stack.length} here` : undefined}
        />
      ) : (
        stack && (
          <StackPopup
            items={stack}
            today={today}
            onSelect={item => openItem(item, { keepStack: true })}
            onClose={closePopup}
          />
        )
      )}
    </div>
  );
}
