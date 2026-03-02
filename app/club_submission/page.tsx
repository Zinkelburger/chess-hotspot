import SubmitClub from '../components/SubmitClub';
import { GITHUB_URL } from '@/lib/constants';

export const metadata = { title: 'Suggest a club' };

export default function ClubSubmissionPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div
        className="relative rounded-2xl border-2 border-black bg-white px-6 py-4 shadow-xl flex flex-col gap-3"
        style={{ width: 'min(90vw, 360px)' }}
      >
        <a
          href="/"
          aria-label="Close"
          className="pretty-pill pretty-pill-neutral"
          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', padding: '0.2rem 0.5rem' }}
        >
          &#x2715;
        </a>

        <h1 className="text-2xl font-bold text-center">Suggest a new club</h1>

        <div className="px-2">
          <SubmitClub />
        </div>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener"
          className="pretty-pill pretty-pill-neutral self-center"
        >
          <img src="/github.svg" alt="GitHub" width={28} height={28} />
        </a>
      </div>
    </div>
  );
}
