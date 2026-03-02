'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { SpotRaw } from '@/types/spot';
import type { ChessEvent } from '@/types/event';
import allEvents from '@/public/events.v1.json';

type Stats = { visits: number; rating: number | null };
type PopupTab = 'club' | 'events';

type Props = {
  spot: SpotRaw | null;
  activeEvent: ChessEvent | null;
  defaultTab: PopupTab;
  onClose: () => void;
};

function formatWebsiteLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    const full = `${host}${path}` || host;
    return full.length > 34 ? `${full.slice(0, 31)}...` : full;
  } catch {
    return rawUrl.length > 34 ? `${rawUrl.slice(0, 31)}...` : rawUrl;
  }
}

const WEEKDAY_ORDER = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const EVENT_TYPE_LABELS: Record<string, string> = {
  tournament: 'Tournament',
  meetup: 'Meetup',
  simul: 'Simul',
  lesson: 'Lesson',
};

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function SpotPopup({ spot, activeEvent, defaultTab, onClose }: Props) {
  const [tab, setTab] = useState<PopupTab>(defaultTab);
  const [rating, setRating] = useState(0);
  const [visitedAt, setVisitedAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [stats, setStats] = useState<Stats>({ visits: 0, rating: null });
  const abortRef = useRef<AbortController | null>(null);

  const urls = useMemo(
    () => (spot?.website ? [spot.website].flat() : []),
    [spot?.website],
  );

  const openDays = useMemo(() => {
    const days = Object.keys(spot?.hours ?? {}).filter((d) =>
      WEEKDAY_ORDER.includes(d as (typeof WEEKDAY_ORDER)[number]),
    );
    days.sort(
      (a, b) =>
        WEEKDAY_ORDER.indexOf(a as (typeof WEEKDAY_ORDER)[number]) -
        WEEKDAY_ORDER.indexOf(b as (typeof WEEKDAY_ORDER)[number]),
    );
    return days;
  }, [spot?.hours]);

  const clubEvents = useMemo(() => {
    if (!spot) return [];
    const today = new Date().toISOString().slice(0, 10);
    return (allEvents as ChessEvent[])
      .filter((e) => e.hostClubId === spot.id)
      .filter((e) => (e.endDate ?? e.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [spot]);

  const eventsToShow = useMemo(() => {
    if (clubEvents.length > 0) return clubEvents;
    if (activeEvent) return [activeEvent];
    return [];
  }, [clubEvents, activeEvent]);

  const dialogTitle = spot?.name ?? activeEvent?.name ?? '';

  const fetchStats = useCallback(
    (signal?: AbortSignal) => {
      if (!spot) return Promise.resolve();
      return fetch(`/api/visit?spotId=${spot.id}`, { signal })
        .then((r) => r.json() as Promise<Stats>)
        .then((data) => {
          setStats(data);
          setStatsLoaded(true);
        })
        .catch(() => {});
    },
    [spot],
  );

  useEffect(() => {
    if (!spot) return;
    const controller = new AbortController();
    abortRef.current = controller;
    fetchStats(controller.signal);
    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [fetchStats, spot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!rating || !visitedAt || !spot) return;
    setSubmitting(true);
    try {
      await fetch('/api/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotId: spot.id, rating, visitedAt }),
      });
      await fetchStats(abortRef.current?.signal);
      setRating(0);
      setVisitedAt(new Date().toISOString().slice(0, 10));
      setReportOpen(false);
    } catch {
      /* network errors silently ignored for now */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={dialogTitle}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2, 6, 23, 0.45)',
      }}
      onClick={onClose}
    >
      <div
        className="relative"
        style={{
          width: 'min(92vw, 390px)',
          maxHeight: '84vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '1rem',
          padding: '1rem',
          boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="pretty-pill pretty-pill-neutral"
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            padding: '0.2rem 0.5rem',
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          &#x2715;
        </button>

        {/* Tab toggle */}
        <div className="flex gap-0 mb-1" style={{ paddingRight: '2rem' }}>
          <button
            onClick={() => setTab('club')}
            className="text-sm font-semibold px-3 py-1 rounded-l-md border transition-colors"
            style={{
              background: tab === 'club' ? '#00e67f' : 'transparent',
              color: tab === 'club' ? '#fff' : '#9ca3af',
              borderColor: tab === 'club' ? '#00e67f' : '#d1d5db',
            }}
          >
            Club
          </button>
          <button
            onClick={() => setTab('events')}
            className="text-sm font-semibold px-3 py-1 rounded-r-md border-t border-r border-b transition-colors"
            style={{
              background: tab === 'events' ? '#3B82F6' : 'transparent',
              color: tab === 'events' ? '#fff' : '#9ca3af',
              borderColor: tab === 'events' ? '#3B82F6' : '#d1d5db',
            }}
          >
            Events{eventsToShow.length > 0 && ` (${eventsToShow.length})`}
          </button>
        </div>

        {/* ── Club tab ── */}
        {tab === 'club' && spot && (
          <>
            {spot.photo && (
              <img
                src={spot.photo}
                alt={spot.name}
                style={{
                  width: '100%',
                  height: '10rem',
                  borderRadius: '0.5rem',
                  objectFit: 'cover',
                }}
              />
            )}

            <h2 className="text-xl font-semibold" style={{ margin: 0, paddingRight: '2rem' }}>
              {spot.name}
            </h2>

            {spot.category && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="pretty-pill pretty-pill-green pretty-pill-static self-start text-xs capitalize">
                  {spot.category.replace(/_/g, ' ')}
                </span>
                {openDays.map((day) => (
                  <span
                    key={day}
                    className="pretty-pill pretty-pill-neutral pretty-pill-static self-start text-xs"
                  >
                    {day}
                  </span>
                ))}
              </div>
            )}

            {spot.notes && (
              <p className="text-sm leading-snug text-gray-600 whitespace-pre-line" style={{ margin: 0 }}>
                {spot.notes}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginTop: '0.15rem',
              }}
            >
              {spot.gmap && (
                <a
                  href={spot.gmap}
                  target="_blank"
                  rel="noopener"
                  className="pretty-pill pretty-pill-green"
                >
                  Google Maps
                </a>
              )}
              {urls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="pretty-pill pretty-pill-blue"
                >
                  {formatWebsiteLabel(url)}
                </a>
              ))}
            </div>

            {statsLoaded && (
              <div className="text-sm text-gray-600">
                <div>Visited {stats.visits} times</div>
                {stats.rating !== null && (
                  <div>Average rating: {stats.rating.toFixed(1)}</div>
                )}
              </div>
            )}

            <button
              onClick={() => setReportOpen(true)}
              className="pretty-pill pretty-pill-solid-blue self-start"
            >
              Report visit
            </button>
          </>
        )}

        {tab === 'club' && !spot && (
          <div className="py-6 text-center">
            <h2 className="text-lg font-semibold mb-2" style={{ margin: 0 }}>
              {activeEvent?.name}
            </h2>
            <p className="text-sm text-gray-500">
              No club associated with this event.
            </p>
          </div>
        )}

        {/* ── Events tab ── */}
        {tab === 'events' && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold" style={{ margin: 0, paddingRight: '2rem' }}>
              {spot?.name ?? activeEvent?.name ?? 'Events'}
            </h2>

            {eventsToShow.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                No upcoming events for this club.
              </p>
            ) : (
              eventsToShow.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-lg border border-gray-200 p-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{ev.name}</span>
                    <span className="pretty-pill pretty-pill-blue pretty-pill-static text-xs">
                      {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    {formatDate(ev.date)}
                    {ev.endDate && ` – ${formatDate(ev.endDate)}`}
                    {ev.time && ` at ${ev.time}`}
                  </div>
                  {ev.venue && (
                    <div className="text-xs text-gray-500">
                      {ev.venue}
                    </div>
                  )}
                  {(ev.entryFeeText || ev.entryFeeUsdMin != null || ev.entryFeeUsdMax != null) && (
                    <div className="text-xs text-gray-500">
                      Entry:{' '}
                      {ev.entryFeeText ??
                        (ev.entryFeeUsdMin != null && ev.entryFeeUsdMax != null
                          ? `${formatUsd(ev.entryFeeUsdMin)}-${formatUsd(ev.entryFeeUsdMax)}`
                          : formatUsd(ev.entryFeeUsdMin ?? ev.entryFeeUsdMax ?? 0))}
                    </div>
                  )}
                  {(ev.prizeFundGuaranteedUsd != null || ev.topPrizeUsd != null) && (
                    <div className="text-xs text-gray-500">
                      {ev.prizeFundGuaranteedUsd != null &&
                        `Guaranteed prizes: ${formatUsd(ev.prizeFundGuaranteedUsd)}`}
                      {ev.prizeFundGuaranteedUsd != null && ev.topPrizeUsd != null && ' · '}
                      {ev.topPrizeUsd != null && `Top prize: ${formatUsd(ev.topPrizeUsd)}`}
                    </div>
                  )}
                  {ev.timeControl && (
                    <div className="text-xs text-gray-500">
                      Time control: {ev.timeControl.raw ?? ev.timeControl.kind}
                    </div>
                  )}
                  {ev.rated != null && (
                    <div className="text-xs text-gray-500">
                      {ev.rated ? 'Rated' : 'Unrated'}
                      {ev.ratingSystem && ev.ratingSystem !== 'none' ? ` (${ev.ratingSystem})` : ''}
                    </div>
                  )}
                  {ev.sections && ev.sections.length > 0 && (
                    <div className="text-xs text-gray-500">
                      Sections: {ev.sections.map((s) => s.name).join(', ')}
                    </div>
                  )}
                  {ev.notes && (
                    <p className="text-xs text-gray-500 whitespace-pre-line" style={{ margin: 0 }}>
                      {ev.notes}
                    </p>
                  )}
                  {ev.website && (
                    <a
                      href={ev.website}
                      target="_blank"
                      rel="noopener"
                      className="pretty-pill pretty-pill-blue self-start text-xs"
                    >
                      Details
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Report visit overlay (club only) ── */}
        {reportOpen && spot && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '1rem',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                width: 'min(90vw, 280px)',
                borderRadius: '0.75rem',
                background: '#ffffff',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                Date visited
                <input
                  type="date"
                  value={visitedAt}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setVisitedAt(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                Rating
                <select
                  value={rating}
                  onChange={(e) => setRating(parseInt(e.target.value))}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value={0}>Select</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="pretty-pill pretty-pill-solid-blue disabled:opacity-50"
                >
                  {submitting ? 'Sending\u2026' : 'Submit'}
                </button>
                <button
                  onClick={() => setReportOpen(false)}
                  className="pretty-pill pretty-pill-solid-gray"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
