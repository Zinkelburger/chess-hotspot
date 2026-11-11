import type { Metadata } from 'next';
import Link from 'next/link';
import TournamentFinder from '@/app/components/TournamentFinder';
import { SITE_URL } from '@/lib/event-seo';

const description =
  'Search every upcoming US chess tournament in one table: filter by distance from you, date, time control, length, FIDE rating and prize fund, sort by any column, and see the results on a map.';

export const metadata: Metadata = {
  title: 'Find a Chess Tournament Near You',
  description,
  alternates: { canonical: `${SITE_URL}/tournaments` },
  openGraph: { title: 'Find a chess tournament near you', description, type: 'website', url: `${SITE_URL}/tournaments` },
};

export default function Tournaments() {
  return (
    <main className="h-full w-full overflow-hidden">
      <h1 className="sr-only">Find a chess tournament near you</h1>
      <p className="sr-only">{description}</p>
      <TournamentFinder />
      <nav className="sr-only" aria-label="Browse listings">
        <Link href="/events">Chess tournaments by state</Link>
        <Link href="/events/online">Online chess tournaments</Link>
        <Link href="/">Chess clubs near you</Link>
        <Link href="/learn">Chess coaches, classes and schools</Link>
      </nav>
    </main>
  );
}
