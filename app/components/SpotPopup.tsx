'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { SpotRaw } from '@/types/spot';

type Stats = { visits: number; rating: number | null };

type Props = {
  spot: SpotRaw;
  onClose: () => void;
};

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

  const stableClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stableClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stableClose]);

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
      className="fixed inset-0 flex items-center justify-center"
      style={{ pointerEvents: 'none', zIndex: 100 }}
    >
      <div
        className="relative rounded-2xl bg-white p-4 shadow-xl flex flex-col gap-2"
        style={{ pointerEvents: 'auto', width: 'min(90vw, 360px)' }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="close-circle"
        >
          &#x2715;
        </button>

        <img
          src={spot.photo ?? '/img/default.jpg'}
          alt={spot.name}
          className="w-full h-40 rounded-lg object-cover"
        />

        <h2 className="text-xl font-semibold">{spot.name}</h2>

        {spot.category && (
          <span className="self-start rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize">
            {spot.category.replace(/_/g, ' ')}
          </span>
        )}

        {spot.notes && (
          <p className="text-sm leading-snug text-gray-600">{spot.notes}</p>
        )}

        <div className="flex gap-3 text-sm">
          {spot.gmap && (
            <a
              href={spot.gmap}
              target="_blank"
              rel="noopener"
              className="text-emerald-600 underline"
            >
              Google Maps
            </a>
          )}
          {spot.website && (
            Array.isArray(spot.website) ? (
              spot.website.map((url, i) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="text-emerald-600 underline"
                >
                  {spot.website!.length > 1 ? `Site ${i + 1}` : 'Club site'}
                </a>
              ))
            ) : (
              <a
                href={spot.website}
                target="_blank"
                rel="noopener"
                className="text-emerald-600 underline"
              >
                Club site
              </a>
            )
          )}
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
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition hover:bg-blue-700"
        >
          Report visit
        </button>

        {reportOpen && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-2xl"
            style={{ background: 'rgba(0,0,0,0.2)' }}
          >
            <div
              className="rounded-xl bg-white p-4 flex flex-col gap-3"
              style={{ width: 'min(90vw, 280px)' }}
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
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Sending\u2026' : 'Submit'}
                </button>
                <button
                  onClick={() => setReportOpen(false)}
                  className="rounded-md bg-gray-500 px-3 py-1.5 text-sm text-white transition hover:bg-gray-600"
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
