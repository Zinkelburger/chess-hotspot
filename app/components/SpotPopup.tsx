'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { SpotRaw } from '@/types/spot';

type Stats = { visits: number; rating: number | null };

type Props = {
  spot: SpotRaw;
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

export default function SpotPopup({ spot, onClose }: Props) {
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
    () => (spot.website ? [spot.website].flat() : []),
    [spot.website],
  );
  const displayCategory = spot.category === 'club' ? 'park' : spot.category;
  const categoryPillClass =
    displayCategory === 'park'
      ? 'pretty-pill pretty-pill-green'
      : displayCategory === 'tournament'
        ? 'pretty-pill pretty-pill-blue'
        : 'pretty-pill pretty-pill-green';

  const fetchStats = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/visit?spotId=${spot.id}`, { signal })
        .then((r) => r.json() as Promise<Stats>)
        .then((data) => {
          setStats(data);
          setStatsLoaded(true);
        })
        .catch(() => {}),
    [spot.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    fetchStats(controller.signal);
    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [fetchStats]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!rating || !visitedAt) return;
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
      aria-label={spot.name}
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
          }}
        >
          &#x2715;
        </button>

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
          <span className={`${categoryPillClass} self-start text-xs capitalize`}>
            {displayCategory.replace(/_/g, ' ')}
          </span>
        )}

        {spot.notes && (
          <p className="text-sm leading-snug text-gray-600" style={{ margin: 0 }}>
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

        {reportOpen && (
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
