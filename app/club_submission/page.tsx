import SubmitClub from '../components/SubmitClub';

export const metadata = { title: 'Suggest a club' };

/* full-page wrapper */
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f8f8f8',
  padding: '1rem',
};

/* the card itself – rounded with inline CSS */
const cardStyle: React.CSSProperties = {
  width: 'min(90vw, 360px)',   // clamps to 360 px on desktop
  background: '#fff',
  border: '2px solid #000',
  borderRadius: '1rem',        // <- the 16 px curve you want
  padding: '1rem 1.5rem 0.5rem 1.5rem',           // outer padding (textboxes won’t hit the border)
  boxShadow: '0 10px 30px rgba(0,0,0,.1)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  position: 'relative',
};

export default function ClubSubmissionPage() {
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 700,
            textAlign: 'center',
            color: 'var(--text, #000)',
          }}
        >
          Suggest a new club
        </h1>

        {/* extra inner padding so the inputs don’t span 100 % of the card */}
        <div style={{ paddingInline: '0.5rem' }}>
          <SubmitClub />
        </div>

        <a
          href="https://github.com/Zinkelburger/chess-hotspot"
          target="_blank"
          rel="noopener"
          /* Tailwind handles the hover fade—no JS, no server-component error */
          className="self-center opacity-90 transition-opacity duration-200 hover:opacity-70"
        >
          <img src="/github.svg" alt="GitHub" width={28} height={28} />
        </a>
      </div>
    </div>
  );
}
