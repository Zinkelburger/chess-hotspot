import type { Metadata } from 'next';
import Link from 'next/link';
import SeoShell from '@/app/components/SeoShell';
import SeoEventList from '@/app/components/SeoEventList';
import { activeEvents, statePages, buildDay } from '@/lib/event-pages';
import { SITE_URL } from '@/lib/event-seo';
export const metadata: Metadata = { title: 'US Chess Tournaments & Events by State', description: 'Find upcoming US chess tournaments by state. Compare tournament dates, venues, time controls, entry fees and organizer registration information.', alternates: { canonical: `${SITE_URL}/events` } };
export default function EventsPage() {
  const physical = activeEvents.filter(e => !e.online);
  const upcoming = physical.filter(e => e.date >= buildDay);
  return <SeoShell><p className="seo-eyebrow">Find your next game</p><h1>Chess tournaments across the United States</h1><p className="seo-intro">Browse {physical.length} upcoming and ongoing in-person chess events. Find a tournament close to home, compare schedules, and check entry details before you register.</p><div className="seo-actions"><Link href="/tournaments" className="seo-primary">Search and filter every tournament →</Link><Link href="/events/online">Online chess events →</Link></div><section aria-labelledby="states-title"><h2 id="states-title">Browse tournaments by state</h2><ul className="seo-state-grid">{statePages.filter(s => s.events.length).map(s => <li key={s.code}><Link href={`/tournaments/${s.slug}`}><span>{s.name}</span><small>{s.events.length} {s.events.length === 1 ? 'event' : 'events'}</small></Link></li>)}</ul></section><section><h2>Next tournaments around the country</h2><p>Showing the next {Math.min(48,upcoming.length)} listings. Choose a state above for its complete calendar.</p><SeoEventList events={upcoming.slice(0,48)} /></section></SeoShell>;
}
