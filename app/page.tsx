import type { Metadata } from 'next';
import Link from 'next/link';
import ClubFinder from './components/ClubFinder';
import { SITE_URL } from '@/lib/event-seo';

const description =
  'Find a chess club near you on a live map of US clubs and club nights, search every upcoming tournament by distance, date and time control, and find a coach or chess school.';

export const metadata: Metadata = {
  title: { absolute: 'Chess Hotspot | Chess clubs, tournaments and coaches near you' },
  description,
  alternates: { canonical: SITE_URL },
  openGraph: { title: 'Chess Hotspot', description, type: 'website', url: SITE_URL },
};

/** Clubs: the list beside the map. Tournaments and coaches use the same layout. */
export default function Home() {
  return (
    <main className="h-full w-full overflow-hidden">
      <h1 className="sr-only">Chess clubs near you</h1>
      <p className="sr-only">{description}</p>
      <ClubFinder />
      <nav className="sr-only" aria-label="Browse listings">
        <Link href="/tournaments">Find a chess tournament</Link>
        <Link href="/learn">Chess coaches, classes and schools</Link>
        <Link href="/events">Chess tournaments by state</Link>
        <Link href="/events/online">Online chess tournaments</Link>
        <Link href="/club_submission">Suggest a club</Link>
      </nav>
    </main>
  );
}
