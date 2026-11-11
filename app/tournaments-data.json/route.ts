import events from '@/public/events.v1.json';
import status from '@/public/events-status.json';
import type { ChessEvent } from '@/types/event';
import { addDays, isListedEvent, localDate } from '@/lib/explore';

// The tournament finder's data, written once at build time as a static file:
// upcoming listings only, without the scraper's review bookkeeping.
export const dynamic = 'force-static';

export type TournamentData = {
  events: ChessEvent[];
  /** When the listings were last refreshed. */
  updatedAt: string | null;
};

export function GET() {
  // A day's grace so an event is not dropped while it is still "today"
  // somewhere west of the build machine. The browser hides what has ended.
  const cutoff = addDays(localDate(), -1);
  const upcoming = (events as ChessEvent[])
    .filter(event => isListedEvent(event, cutoff))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const data: TournamentData = { events: upcoming, updatedAt: status.updatedAt ?? null };
  return Response.json(data);
}
