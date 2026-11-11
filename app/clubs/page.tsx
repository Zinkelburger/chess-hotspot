import type { Metadata } from 'next';
import Link from 'next/link';
import ClubFinder from '@/app/components/ClubFinder';
import { SITE_URL } from '@/lib/event-seo';

const description =
  'Find a chess club near you. A map of US chess clubs with meeting days, times and links — filter by the night you are free.';

export const metadata: Metadata = {
  title: 'Find Chess Clubs Near You',
  description,
  alternates: { canonical: `${SITE_URL}/clubs` },
};

/** The club finder under its own name; the homepage is the same page. */
export default function Clubs() {
  return (
    <main className="h-full w-full overflow-hidden">
      <h1 className="sr-only">Find chess clubs near you</h1>
      <p className="sr-only">{description}</p>
      <ClubFinder />
      <nav className="sr-only" aria-label="Browse listings">
        <Link href="/tournaments">Find a chess tournament</Link>
        <Link href="/learn">Chess coaches, classes and schools</Link>
        <Link href="/events">Chess tournaments by state</Link>
      </nav>
    </main>
  );
}
