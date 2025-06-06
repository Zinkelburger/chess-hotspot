import SubmitClub from '../components/SubmitClub';

export const metadata = { title: 'Suggest a club' };

export default function ClubSubmissionPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-2xl border border-secondary/40
                      bg-white shadow-lg p-8 space-y-6">
        <h1 className="text-2xl font-bold text-center text-text">
          Suggest a new club
        </h1>

        <SubmitClub />

        <div className="flex justify-center pt-2">
          <a href="https://github.com/Zinkelburger/chess-hotspot"
             target="_blank" rel="noopener"
             className="transition hover:opacity-80">
            <img src="/github.svg" alt="GitHub" className="w-7 h-7" />
          </a>
        </div>
      </div>
    </div>
  );
}
