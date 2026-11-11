import type { Metadata } from 'next';
import SeoShell from '@/app/components/SeoShell';
import SeoEventList from '@/app/components/SeoEventList';
import { activeEvents } from '@/lib/event-pages';
import { SITE_URL } from '@/lib/event-seo';
export const metadata: Metadata = { title: 'Online Chess Events & Tournaments', description: 'Browse upcoming online chess tournaments, dates, time controls and organizer entry information.', alternates: { canonical: `${SITE_URL}/events/online` } };
export default function OnlineEvents() { const events = activeEvents.filter(e => e.online); return <SeoShell><p className="seo-eyebrow">Play from anywhere</p><h1>Online chess tournaments</h1><p className="seo-intro">{events.length} listed online events. Check each organizer’s platform, rating requirements, and time zone before entering.</p><SeoEventList events={events}/></SeoShell>; }
