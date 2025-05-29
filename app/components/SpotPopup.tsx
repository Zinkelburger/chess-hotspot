// components/SpotPopup.tsx
'use client';

type Props = {
  spot: any;
  onClose: () => void;
};

export default function SpotPopup({ spot, onClose }: Props) {
  if (!spot) return null;         // safety: nothing selected

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
          padding: '1.25rem',
          boxShadow: '0 10px 30px rgba(0,0,0,.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          pointerEvents: 'auto', // re-enable interaction on the card
        }}
      >
        <img
          src={spot.photo ?? '/img/default.jpg'}
          alt={spot.name}
          style={{
            width: '100%',
            height: '160px',
            objectFit: 'cover',
            borderRadius: '0.5rem',
          }}
        />

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{spot.name}</h2>

        {spot.category && (
          <span
            style={{
              alignSelf: 'flex-start',
              background: '#f3f4f6',
              borderRadius: '9999px',
              padding: '0.125rem 0.5rem',
              fontSize: '0.75rem',
              textTransform: 'capitalize',
            }}
          >
            {spot.category.replace(/_/g, ' ')}
          </span>
        )}

        {spot.notes && (
          <p style={{ fontSize: '0.875rem', lineHeight: 1.4, color: '#374151' }}>
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

        <button
          onClick={onClose}
          style={{
            marginTop: '0.75rem',
            width: '100%',
            background: '#059669',
            color: '#fff',
            padding: '0.4rem 0',
            borderRadius: '0.375rem',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
