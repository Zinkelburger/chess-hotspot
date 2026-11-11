import type { Metadata } from 'next';
import Link from 'next/link';
import LearnFinder from '@/app/components/LearnFinder';
import { SITE_URL } from '@/lib/event-seo';

const description =
  'Find a chess coach, class, camp or chess school near you. A searchable directory and map of US coaches, academies and clubs that teach, with online coaches for wherever you live.';

export const metadata: Metadata = {
  title: 'Chess Coaches, Classes and Schools Near You',
  description,
  alternates: { canonical: `${SITE_URL}/learn` },
  openGraph: { title: 'Chess coaches, classes and schools near you', description, type: 'website', url: `${SITE_URL}/learn` },
};

export default function Learn() {
  return (
    <main className="h-full w-full overflow-hidden">
      <h1 className="sr-only">Chess coaches, classes and schools near you</h1>
      <p className="sr-only">{description}</p>
      <LearnFinder />
      <nav className="sr-only" aria-label="Browse listings">
        <Link href="/">Chess clubs near you</Link>
        <Link href="/tournaments">Find a chess tournament</Link>
      </nav>
    </main>
  );
}
