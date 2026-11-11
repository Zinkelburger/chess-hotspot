'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { preload } from 'react-dom';
import clsx from 'clsx';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { coordKey } from '@/lib/explore';
import {
  KIND_NAMES,
  LEARN_KINDS,
  OFFERS,
  OFFER_LABELS,
  activeLearnFilterCount,
  buildLearnRows,
  defaultLFilters,
  filterLearn,
  groupLearn,
  lFiltersFromParams,
  lFiltersToParams,
  learnPlace,
  type LFilters,
  type LRow,
  type LSort,
  type LearnData,
  type LearnKind,
  type LearnListing,
} from '@/lib/learn';
import { formatMiles } from '@/lib/tournaments';
import { SITE_URL } from '@/lib/event-seo';
import { STATES } from '@/lib/us-states';
import { usePopupHistory } from '@/app/hooks/usePopupHistory';
import type { PinProps } from './ExploreMap';
import Chip from './Chip';
import { CloseButton, PopupShell, Story } from './DetailPopup';
import FinderShell, {
  ListFooter,
  PickedBanner,
  boxAround,
  useInlineDetail,
  readSavedPlace,
  savePlace,
  useFinderView,
} from './FinderShell';
import Icon from './Icon';
import MetaRow from './MetaRow';
import ShareButton from './ShareButton';

const DATA_PATH = '/learn.v1.json';
const PAGE = 120;
const VIOLET = '#8b5cf6';
const KIND_PILL: Record<LearnKind, string> = {
  coach: 'pretty-pill-violet',
  academy: 'pretty-pill-amber',
  club: 'pretty-pill-green',
};
const SORT_LABELS: Record<LSort, string> = {
  type: 'By type',
  distance: 'Nearest first',
  name: 'Name A–Z',
};

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter(x => x !== value) : [...list, value];
const listingHash = (listing: LearnListing) => `#listing=${encodeURIComponent(listing.id)}`;
const clip = (text: string, length = 150) =>
  text.length > length ? `${text.slice(0, text.lastIndexOf(' ', length))}…` : text;
const mapsUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
const inFrame = (
  listing: LearnListing,
  b: { west: number; east: number; south: number; north: number },
) =>
  listing.lat != null &&
  listing.lng != null &&
  listing.lat >= b.south &&
  listing.lat <= b.north &&
  (b.west <= b.east
    ? listing.lng >= b.west && listing.lng <= b.east
    : listing.lng >= b.west || listing.lng <= b.east);

/**
 * Who teaches chess: coaches, chess schools, and clubs that run lessons,
 * classes or camps. Say where you are and it lists what is close, then the
 * coaches who teach online from anywhere.
 */
export default function LearnFinder() {
  preload(DATA_PATH, { as: 'fetch', crossOrigin: 'anonymous' });

  const [data, setData] = useState<LearnData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState<LFilters>(defaultLFilters);
  const [sortChoice, setSortChoice] = useState<LSort | null>(null);
  /** True once the URL has been read, so writing it back cannot clobber it. */
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** The listings under a pin that holds several, listed on their own until cleared. */
  const [picked, setPicked] = useState<string[] | null>(null);

  const set = useCallback(
    (patch: Partial<LFilters>) => setFilters(current => ({ ...current, ...patch })),
    [],
  );

  useEffect(() => {
    let live = true;
    fetch(DATA_PATH)
      .then(res => {
        if (!res.ok) throw new Error(`${DATA_PATH}: HTTP ${res.status}`);
        return res.json() as Promise<LearnData>;
      })
      .then(
        loaded => live && setData(loaded),
        err => {
          console.error('Could not load the directory', err);
          if (live) setFailed(true);
        },
      );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let next = lFiltersFromParams(params);
    // A bare visit starts from the place used last time.
    if (![...params.keys()].length) next = { ...next, near: readSavedPlace() };
    setFilters(next);
    const sortParam = params.get('sort') as LSort | null;
    if (sortParam && sortParam in SORT_LABELS) setSortChoice(sortParam);
    setReady(true);
  }, []);

  // With a place chosen the natural order is nearest first; without one, by type.
  const sort: LSort =
    sortChoice && (sortChoice !== 'distance' || filters.near)
      ? sortChoice
      : filters.near
        ? 'distance'
        : 'type';

  // ─── Listings ───

  const rows = useMemo(
    () => buildLearnRows(data?.listings ?? [], filters.near),
    [data, filters.near],
  );
  const stateBox = useMemo(
    () =>
      filters.state
        ? boxAround(
            rows
              .map(row => row.listing)
              .filter(l => l.state === filters.state && l.lat != null && l.lng != null)
              .map(l => ({ lat: l.lat!, lng: l.lng! })),
          )
        : null,
    [rows, filters.state],
  );
  const view = useFinderView(filters, stateBox, data != null);
  const { writeParam, scrollToTop, startAt, scope, panTo } = view;

  useEffect(() => {
    if (!ready) return;
    const params = lFiltersToParams(filters);
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
  const matched = useMemo(() => filterLearn(rows, filters), [rows, filters]);
  /** What the list shows: the same, or only what is inside the map's frame. */
  const { local, online } = useMemo(
    () =>
      picked
        ? {
            local: matched.local.filter(row => picked.includes(row.listing.id)),
            online: matched.online.filter(row => picked.includes(row.listing.id)),
          }
        : scope
          ? {
              local: matched.local.filter(row => inFrame(row.listing, scope)),
              online: matched.online.filter(row => inFrame(row.listing, scope)),
            }
          : matched,
    [matched, scope, picked],
  );
  const groups = useMemo(() => groupLearn(local, online, sort), [local, online, sort]);
  const total = local.length + online.length;

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { listing } of rows)
      if (listing.state && STATES[listing.state])
        counts.set(listing.state, (counts.get(listing.state) ?? 0) + 1);
    return counts;
  }, [rows]);

  // A new set of results starts again from the top.
  useEffect(() => {
    setShown(PAGE);
    setPicked(null);
    scrollToTop();
  }, [filters, sort, scrollToTop]);

  // ─── Popup ───

  const byId = useMemo(
    () => new Map((data?.listings ?? []).map(listing => [listing.id, listing])),
    [data],
  );
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const findByHash = useCallback((hash: string) => {
    const match = hash.match(/^#listing=(.+)$/);
    return (match && byIdRef.current.get(decodeURIComponent(match[1]))) || null;
  }, []);
  const popup = usePopupHistory<LearnListing>(listingHash, findByHash);
  const { open, openStack, close } = popup;
  const activeId = popup.active?.id ?? null;
  const { inline, reveal } = useInlineDetail(view, activeId, close);

  const toggleListing = useCallback(
    (id: string) => {
      if (activeId === id) return close();
      const listing = byIdRef.current.get(id);
      if (!listing) return;
      open(listing);
      panTo(listing.lat, listing.lng);
    },
    [activeId, open, close, panTo],
  );

  const didDeepLinkRef = useRef(false);
  useEffect(() => {
    if (didDeepLinkRef.current || !data) return;
    didDeepLinkRef.current = true;
    const listing = findByHash(window.location.hash);
    if (!listing) return;
    if (listing.lat != null && listing.lng != null) startAt(listing.lat, listing.lng);
    reveal();
    open(listing, { replace: true });
  }, [data, findByHash, open, startAt, reveal]);

  // ─── Map ───

  // Town and ZIP-code pins are shared by everyone placed there.
  const { pins, pinMembers } = useMemo(() => {
    const members = new Map<string, LearnListing[]>();
    for (const { listing } of [...matched.local, ...matched.online]) {
      if (listing.lat == null || listing.lng == null) continue;
      const key = `stack:${coordKey(listing.lat, listing.lng)}`;
      const group = members.get(key);
      if (group) group.push(listing);
      else members.set(key, [listing]);
    }
    const features: Feature<Point, PinProps>[] = [];
    for (const [key, group] of members)
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [group[0].lng!, group[0].lat!] },
        properties: { key, kind: 'school', count: group.length, big: false },
      });
    const collection: FeatureCollection<Point, PinProps> = { type: 'FeatureCollection', features };
    return { pins: collection, pinMembers: members };
  }, [matched]);

  const handlePick = useCallback(
    (keys: string[]) => {
      const group = keys.flatMap(key => pinMembers.get(key) ?? []);
      if (group.length === 1) {
        reveal();
        open(group[0]);
      } else if (group.length > 1 && inline) {
        // A town or ZIP pin: list just the people based there.
        if (popup.active) close();
        setPicked(group.map(listing => listing.id));
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
    const target = popup.active ?? popup.stack?.[0] ?? (hoverId ? byId.get(hoverId) : undefined);
    return target?.lat != null && target.lng != null
      ? { lng: target.lng, lat: target.lat, color: VIOLET }
      : null;
  }, [popup.active, popup.stack, hoverId, byId]);

  // ─── Render ───

  const loaded = data != null;
  const filterCount = activeLearnFilterCount(filters);
  const narrowed = filterCount > 0 || !!filters.q.trim() || !!filters.near;
  const where = filters.near
    ? filters.radius > 0
      ? `within ${filters.radius} mi of ${filters.near.label}`
      : `nearest ${filters.near.label}`
    : filters.state
      ? `in ${STATES[filters.state]}`
      : '';
  const reset = () => {
    setFilters(defaultLFilters);
    view.setAreaOnly(false);
  };

  // Page down to a listing opened from the map or a link.
  const activeIndex = useMemo(() => {
    if (!activeId) return -1;
    let i = 0;
    for (const group of groups)
      for (const row of group.rows) {
        if (row.listing.id === activeId) return i;
        i += 1;
      }
    return -1;
  }, [groups, activeId]);
  useEffect(() => {
    if (activeIndex >= shown) setShown(Math.ceil((activeIndex + 1) / PAGE) * PAGE);
  }, [activeIndex, shown]);
  // A listing opened from a link but hidden by the filters is shown above the list.
  const strayRow =
    inline && activeId && activeIndex < 0 ? rows.find(row => row.listing.id === activeId) : undefined;

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
      section="learn"
      view={view}
      search={{
        value: filters.q,
        onChange: q => set({ q }),
        placeholder: 'Name, city, language…',
        label: 'Search coaches and schools by name, city or language',
      }}
      where={filters}
      onWhere={set}
      stateCounts={stateCounts}
      filterCount={filterCount}
      filters={
        <>
          <div className="filter-group">
            <span className="filter-label">Show</span>
            <div className="filter-pills">
              <Chip
                active={filters.kinds.length === 0}
                activeClass="pretty-pill-violet"
                onClick={() => set({ kinds: [] })}
              >
                Everyone
              </Chip>
              {LEARN_KINDS.map(kind => (
                <Chip
                  key={kind}
                  active={filters.kinds.includes(kind)}
                  activeClass={KIND_PILL[kind]}
                  onClick={() => set({ kinds: toggle(filters.kinds, kind) })}
                >
                  {KIND_NAMES[kind].many}
                </Chip>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Offers</span>
            <div className="filter-pills">
              {OFFERS.map(offer => (
                <Chip
                  key={offer}
                  active={filters.offers.includes(offer)}
                  activeClass="pretty-pill-violet"
                  onClick={() => set({ offers: toggle(filters.offers, offer) })}
                >
                  {OFFER_LABELS[offer]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Good for</span>
            <div className="filter-pills">
              <Chip
                active={filters.beginners}
                activeClass="pretty-pill-violet"
                onClick={() => set({ beginners: !filters.beginners })}
              >
                Beginners
              </Chip>
              <Chip
                active={filters.kids}
                activeClass="pretty-pill-violet"
                onClick={() => set({ kids: !filters.kids })}
              >
                Kids
              </Chip>
              <Chip
                active={filters.titled}
                activeClass="pretty-pill-violet"
                onClick={() => set({ titled: !filters.titled })}
                label="Titled coaches: grandmasters, international, FIDE and national masters"
              >
                Titled coach
              </Chip>
            </div>
          </div>
        </>
      }
      count={
        loaded ? (
          <>
            <strong>{local.length.toLocaleString('en-US')}</strong>{' '}
            {local.length === 1 ? 'listing' : 'listings'}
            <span className="finder-count-where">
              {where ? ` ${where}` : ''}
              {scope ? ' · in this map area' : ''}
              {online.length > 0 && ` · plus ${online.length} online coaches`}
            </span>
          </>
        ) : failed ? (
          'The directory did not load. Refresh to try again.'
        ) : (
          'Setting up the board…'
        )
      }
      narrowed={narrowed}
      onClear={reset}
      sort={{
        value: sort,
        options: (Object.keys(SORT_LABELS) as LSort[])
          .filter(key => key !== 'distance' || filters.near)
          .map(key => [key, SORT_LABELS[key]]),
        onChange: setSortChoice,
      }}
      pins={pins}
      highlight={highlight}
      onPick={handlePick}
      onMapClear={handleMapClear}
      popup={
        inline && !popup.stack ? null : popup.active ? (
          <ListingPopup
            listing={popup.active}
            onClose={popup.close}
            onBack={popup.stack ? popup.backToStack : undefined}
            backLabel={popup.stack ? `All ${popup.stack.length} here` : undefined}
          />
        ) : (
          popup.stack && (
            <PopupShell label={`${popup.stack.length} listings here`} onClose={popup.close}>
              <div className="popup-top">
                <div className="popup-heading">
                  <div className="popup-actions">
                    <CloseButton onClose={popup.close} />
                  </div>
                  <h2 className="popup-title">
                    {popup.stack.length} listings around {learnPlace(popup.stack[0])}
                  </h2>
                </div>
                <p className="popup-fine">
                  A pin marks the town or ZIP code, so everyone based there shares it.
                </p>
              </div>
              <div className="popup-body popup-list">
                {popup.stack.map(listing => (
                  <button
                    key={listing.id}
                    type="button"
                    className="popup-list-row"
                    onClick={() => popup.open(listing, { keepStack: true })}
                  >
                    <span className="pill-dot pill-dot-school" aria-hidden="true" />
                    <span className="popup-list-text">
                      <span className="popup-list-name">
                        {listing.title ? `${listing.title} ` : ''}
                        {listing.name}
                      </span>
                      <span className="popup-list-meta">{KIND_NAMES[listing.kind].one}</span>
                    </span>
                  </button>
                ))}
              </div>
            </PopupShell>
          )
        )
      }
    >
      {picked && (
        <PickedBanner count={picked.length} noun={['listing', 'listings']} onClear={() => setPicked(null)} />
      )}
      {strayRow && (
        <section>
          <h2 className="lf-section">Linked listing · not in these filters</h2>
          <ul className="lf-list">
            <Card row={strayRow} active expanded onToggle={toggleListing} />
          </ul>
        </section>
      )}
      {visible.map(group => (
        <section key={group.key}>
          {group.label && (
            <h2 className="lf-section">
              {group.label}
              <span>{group.count}</span>
            </h2>
          )}
          <ul className="lf-list">
            {group.rows.map(row => (
              <Card
                key={row.listing.id}
                row={row}
                active={activeId === row.listing.id}
                expanded={inline && activeId === row.listing.id}
                onToggle={toggleListing}
                onHover={view.wide && view.mapVisible ? setHoverId : undefined}
              />
            ))}
          </ul>
        </section>
      ))}

      <ListFooter
        loaded={loaded}
        total={total}
        shown={shown}
        onMore={() => setShown(shown + PAGE)}
        empty={
          <>
            <p>
              {scope
                ? 'Nobody listed in this part of the map matches.'
                : 'Nobody listed matches these filters.'}
            </p>
            <div className="finder-empty-actions">
              {scope && (
                <button
                  type="button"
                  className="pretty-pill pretty-pill-violet"
                  onClick={() => view.setAreaOnly(false)}
                >
                  Look everywhere
                </button>
              )}
              {!scope && filters.near && filters.radius > 0 && filters.radius < 250 && (
                <button
                  type="button"
                  className="pretty-pill pretty-pill-violet"
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
        Schools, academies and clubs are US Chess affiliates that list lessons, classes or camps.
        Coaches are the US coaches in Lichess’s public coach directory
        {data?.coachesFetchedAt
          ? `, read ${new Date(data.coachesFetchedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}`
          : ''}
        . A listing is not an endorsement: ask about experience, references and rates before you
        book. <Link href="/">Find a club to play at</Link>
      </ListFooter>
    </FinderShell>
  );
}

/** "FIDE 2475 · $80/hour · English, Español" */
function coachFacts(listing: LearnListing): string {
  return [
    listing.fideRating ? `FIDE ${listing.fideRating}` : '',
    listing.rate ? clip(listing.rate, 60) : '',
    listing.languages?.length ? listing.languages.slice(0, 4).join(', ') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const Card = memo(function Card({
  row,
  active,
  expanded,
  onToggle,
  onHover,
}: {
  row: LRow;
  active: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  const { listing } = row;
  const facts = listing.kind === 'coach' ? coachFacts(listing) : '';
  const detailId = `listing-detail-${listing.id}`;
  return (
    <li className={clsx('lf-item', expanded && 'is-open')}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        className={clsx('lf-card', active && 'is-active')}
        onClick={() => onToggle(listing.id)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(listing.id);
          }
        }}
        onMouseEnter={onHover ? () => onHover(listing.id) : undefined}
        onMouseLeave={onHover ? () => onHover(null) : undefined}
      >
        <h3 className="lf-name">
          {listing.title && <span className="lf-title">{listing.title}</span>}
          {row.name}
        </h3>
        <span className="lf-chevron" aria-hidden="true">
          <Icon name="chevron" size={14} />
        </span>
        <span className="lf-place">
          {learnPlace(listing)}
          {row.miles != null && <span className="tf-miles">{formatMiles(row.miles)}</span>}
        </span>
        <div className="lf-pills">
          <span className={`pretty-pill ${KIND_PILL[listing.kind]}`}>{KIND_NAMES[listing.kind].one}</span>
          {listing.kind === 'coach' ? (
            <span className="pretty-pill pretty-pill-sky">Teaches online</span>
          ) : (
            listing.offers.map(offer => (
              <span key={offer} className="pretty-pill pretty-pill-neutral">
                {OFFER_LABELS[offer]}
              </span>
            ))
          )}
          {listing.beginners && <span className="pretty-pill pretty-pill-neutral">Beginners welcome</span>}
        </div>
        {facts && !expanded && <p className="lf-facts">{facts}</p>}
        {listing.notes && !expanded && <p className="lf-desc">{clip(listing.notes)}</p>}
      </div>
      {expanded && <ListingDetails id={detailId} listing={listing} />}
    </li>
  );
});

/** The facts, story and links of a listing: shared by the open row and the phone's sheet. */
function ListingFacts({ listing, inline }: { listing: LearnListing; inline?: boolean }) {
  return (
    <>
      {/* The open row already names the place. */}
      {!inline && (
      <MetaRow icon="pin">
        {learnPlace(listing)}
        {listing.lat != null && listing.precision !== 'venue' && (
          <span className="popup-fine">
            The pin marks the {listing.precision === 'postal' ? 'ZIP code' : 'town'}, not an
            address.
          </span>
        )}
      </MetaRow>
      )}
      {listing.fideRating && <MetaRow icon="star">FIDE rating {listing.fideRating}</MetaRow>}
      {listing.rate && <MetaRow icon="cost">{listing.rate}</MetaRow>}
      {listing.languages?.length ? (
        <MetaRow icon="info">Teaches in {listing.languages.join(', ')}</MetaRow>
      ) : null}
    </>
  );
}

function ListingSourceNote({ listing }: { listing: LearnListing }) {
  return (
    <p className="popup-fine">
      {listing.kind === 'coach'
        ? `From this coach’s public Lichess profile${
            listing.lastActive
              ? `, last active ${new Date(`${listing.lastActive}T12:00:00Z`).toLocaleDateString(
                  'en-US',
                  { month: 'short', year: 'numeric', timeZone: 'UTC' },
                )}`
              : ''
          }. Rates and availability are theirs to confirm.`
        : 'Listed by US Chess as an affiliate offering instruction. Contact them for schedules and prices.'}
    </p>
  );
}

function ListingLinks({ listing, share }: { listing: LearnListing; share?: boolean }) {
  const coach = listing.kind === 'coach';
  const name = `${listing.title ? `${listing.title} ` : ''}${listing.name}`;
  return (
    <>
      {listing.website && (
        <a
          href={listing.website}
          target="_blank"
          rel="noopener noreferrer"
          className="pretty-pill pretty-pill-violet"
        >
          {coach ? 'Lichess coach profile' : 'Website'}
        </a>
      )}
      {listing.clubId && (
        <a href={`/clubs#club=${encodeURIComponent(listing.clubId)}`} className="pretty-pill pretty-pill-green">
          Club nights
        </a>
      )}
      {!coach && (
        <a
          href={mapsUrl([listing.name, listing.city, listing.state].filter(Boolean).join(', '))}
          target="_blank"
          rel="noopener noreferrer"
          className="pretty-pill pretty-pill-sky"
        >
          Directions
        </a>
      )}
      {share && <ShareButton url={`${SITE_URL}/learn${listingHash(listing)}`} title={name} />}
    </>
  );
}

/** A listing opened in place under its row. */
function ListingDetails({ id, listing }: { id: string; listing: LearnListing }) {
  return (
    <div id={id} className="lf-detail">
      <ListingFacts listing={listing} inline />
      {listing.kids && (
        <div className="lf-pills">
          <span className="pretty-pill pretty-pill-neutral">Kids welcome</span>
        </div>
      )}
      {listing.notes && <Story text={listing.notes} />}
      <div className="lf-detail-links">
        <ListingLinks listing={listing} share />
      </div>
      <ListingSourceNote listing={listing} />
    </div>
  );
}

function ListingPopup({
  listing,
  onClose,
  onBack,
  backLabel,
}: {
  listing: LearnListing;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  const coach = listing.kind === 'coach';
  const name = `${listing.title ? `${listing.title} ` : ''}${listing.name}`;
  return (
    <PopupShell label={name} onClose={onClose}>
      <div className="popup-top">
        <div className="popup-heading">
          <div className="popup-actions">
            <ShareButton url={`${SITE_URL}/learn${listingHash(listing)}`} title={name} />
            <CloseButton onClose={onClose} />
          </div>
          {onBack && (
            <button type="button" className="popup-back" onClick={onBack}>
              <Icon name="back" size={14} />
              {backLabel}
            </button>
          )}
          <h2 className="popup-title">{name}</h2>
        </div>
      </div>

      <div className="popup-header">
        <div className="popup-pills">
          <span className={`pretty-pill ${KIND_PILL[listing.kind]}`}>{KIND_NAMES[listing.kind].one}</span>
          {coach && <span className="pretty-pill pretty-pill-sky">Teaches online</span>}
          {!coach &&
            listing.offers.map(offer => (
              <span key={offer} className="pretty-pill pretty-pill-neutral">
                {OFFER_LABELS[offer]}
              </span>
            ))}
          {listing.beginners && <span className="pretty-pill pretty-pill-neutral">Beginners welcome</span>}
          {listing.kids && <span className="pretty-pill pretty-pill-neutral">Kids welcome</span>}
        </div>
        <div className="popup-facts">
          <ListingFacts listing={listing} />
        </div>
      </div>

      <div className="popup-body">
        {listing.notes && <Story text={listing.notes} />}
        <ListingSourceNote listing={listing} />
      </div>

      <div className="popup-footer">
        <ListingLinks listing={listing} />
      </div>
    </PopupShell>
  );
}
