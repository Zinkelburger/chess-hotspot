// components/SpotPopup.tsx
'use client';
import { useEffect, useState } from 'react';

type Props = {
  spot: any;
  onClose: () => void;
};

export default function SpotPopup({ spot, onClose }: Props) {
  if (!spot) return null; // safety: nothing selected

  const [rating, setRating] = useState(0);
  const [visitedAt, setVisitedAt] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [stats, setStats] = useState<{ visits: number; rating: number | null }>({
    visits: 0,
    rating: null
  });

  useEffect(() => {
    fetch(`/api/visit?spotId=${spot.id}`)
      .then((r) =>
        r.json() as Promise<{ visits: number; rating: number | null }>
      )
      .then((data) => setStats(data))
      .catch(() => {});
  }, [spot.id]);

  const submit = async () => {
    if (!rating || !visitedAt) return;
    await fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotId: spot.id, rating, visitedAt })
    });
    setRating(0);
    setVisitedAt('');
    const data: { visits: number; rating: number | null } = await fetch(
      `/api/visit?spotId=${spot.id}`
    ).then((r) => r.json());
    setStats(data);
  };

  return (
    /* ----- simple fixed wrapper, no backdrop, no special z CSS ----- */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',    // clicks go through unless on the card
        zIndex: 100,              // safely above the map & legend
      }}
    >
      {/* ------------------ the card itself ------------------------- */}
      <div
        style={{
          width: 'min(90vw, 360px)',
          background: '#fff',
          borderRadius: '1rem',
          padding: '1rem',
          boxShadow: '0 10px 30px rgba(0,0,0,.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          pointerEvents: 'auto', // re-enable interaction on the card
          position: 'relative',
        }}
      >
        <button onClick={onClose} className="close-circle">&#x2715;</button>
        <img
          src={spot.photo ?? '/img/default.jpg'}
          alt={spot.name}
          style={{
            width: '100%',
            height: '160px',
            objectFit: 'cover',
            borderRadius: '0.5rem',
            display: 'block',
          }}
        />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
          {spot.name}
        </h2>

        {spot.category && (
          <span
            style={{
              alignSelf: 'flex-start',
              background: '#f3f4f6',
              borderRadius: '9999px',
              padding: '0.125rem 0.5rem',
              fontSize: '0.75rem',
              textTransform: 'capitalize',
              margin: 0,
            }}
          >
            {spot.category.replace(/_/g, ' ')}
          </span>
        )}

        {spot.notes && (
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: 1.4,
              color: '#374151',
              margin: 0,
            }}
          >
            {spot.notes}
          </p>
        )}

        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
          {spot.gmap && (
            <a
              href={spot.gmap}
              target="_blank"
              rel="noopener"
              style={{ color: '#059669', textDecoration: 'underline' }}
            >
              Google Maps
            </a>
          )}
          {spot.website && (
          <a
            href={spot.website}
            target="_blank"
            rel="noopener"
            style={{ color: '#059669', textDecoration: 'underline' }}
          >
            Club site
          </a>
        )}
      </div>

        <div style={{ fontSize: '0.875rem', lineHeight: 1.4, margin: 0 }}>
          <div>Visited {stats.visits} times</div>
          {stats.rating !== null && (
            <div>Average busy rating: {stats.rating.toFixed(1)}</div>
          )}
        </div>

        <button
          onClick={() => setReportOpen(true)}
          style={{
            background: '#2563eb',
            color: '#fff',
            padding: '0.4rem',
            borderRadius: '0.375rem'
          }}
        >
          Report visit
        </button>
        {reportOpen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 'min(90vw, 280px)',
                background: '#fff',
                borderRadius: '0.75rem',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <label>
                <span style={{ fontSize: '0.875rem' }}>Visited on</span>
                <input
                  type="datetime-local"
                  value={visitedAt}
                  onChange={(e) => setVisitedAt(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    padding: '4px',
                  }}
                />
              </label>
              <label>
                <span style={{ fontSize: '0.875rem' }}>Busy rating</span>
                <select
                  value={rating}
                  onChange={(e) => setRating(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    padding: '4px',
                  }}
                >
                  <option value={0}>Select</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  onClick={submit}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    padding: '0.4rem',
                    borderRadius: '0.375rem',
                  }}
                >
                  Submit
                </button>
                <button
                  onClick={() => setReportOpen(false)}
                  style={{
                    background: '#6b7280',
                    color: '#fff',
                    padding: '0.4rem',
                    borderRadius: '0.375rem',
                  }}
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
