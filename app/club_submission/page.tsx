import SubmitClub from '../components/SubmitClub';

export const metadata = {
  title: 'Suggest a club',
};

export default function ClubSubmissionPage() {
  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-semibold">Suggest a new club</h1>
      <SubmitClub />
      <div className="pt-4 flex justify-center">
        <a href="https://github.com/Zinkelburger/chess-hotspot" target="_blank" rel="noopener">
          <img src="/github.svg" alt="GitHub" className="w-6 h-6" />
        </a>
      </div>
    </div>
  );
}