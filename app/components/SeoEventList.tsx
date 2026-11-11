import Link from 'next/link';
import type { ChessEvent } from '@/types/event';
import { dateRange, eventPath, placeLabel } from '@/lib/event-seo';
export default function SeoEventList({ events }: { events: ChessEvent[] }) {
  return <ul className="seo-event-list">{events.map(event => <li key={event.id}><p className="seo-eyebrow">{placeLabel(event)}</p><h2><Link href={eventPath(event)}>{event.name}</Link></h2><p className="seo-date">{dateRange(event)}</p>{event.venue && !event.online && <p>{event.venue}</p>}<p>{[event.rated ? event.ratingSystem || 'Rated' : event.rated === false ? 'Unrated' : null, event.format === 'custom' ? 'Multiple / special controls' : event.format].filter(Boolean).join(' · ')}</p>{event.entryFeeText && <p className="seo-excerpt">{event.entryFeeText}</p>}<Link className="seo-text-link" href={eventPath(event)}>Schedule & entry details →</Link></li>)}</ul>;
}
