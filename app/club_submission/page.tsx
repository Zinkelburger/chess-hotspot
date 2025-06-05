import SubmitClub from '../components/SubmitClub';

export const metadata = { title: 'Suggest a club' };

export default function ClubSubmissionPage() {
  return (
    <div className="">
      <div className="">
        <h1 className="text-2xl font-bold text-center">
          Suggest a new club
        </h1>

        <SubmitClub />

        <div className="flex justify-center">
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
