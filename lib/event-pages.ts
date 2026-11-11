import catalog from '@/data/event-pages.json';
import live from '@/public/events.v1.json';
import type { ChessEvent } from '@/types/event';
import { STATES, stateSlug } from './us-states';
export type EventPageRecord = { event: ChessEvent; updatedAt: string; contentHash: string };
export const records = catalog as EventPageRecord[];
export const buildDay = new Date().toISOString().slice(0,10);
const liveIds = new Set(live.map(e => e.id));
export function pageStatus(event: ChessEvent) {
  if (event.cancellationEvidence) return /postponed/i.test(event.cancellationEvidence) ? 'Postponed' : 'Cancelled';
  if ((event.endDate || event.date) < buildDay) return 'Ended';
  if (!liveIds.has(event.id)) return 'Needs confirmation';
  return event.date < buildDay ? 'Ongoing' : 'Upcoming';
}
export const activeEvents = records.map(r => r.event).filter(e => ['Upcoming','Ongoing'].includes(pageStatus(e))).sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
export const statePages = Object.keys(STATES).filter(code => records.some(r => r.event.state === code && !r.event.online)).map(code => ({code, slug: stateSlug(code), name: STATES[code], events: activeEvents.filter(e => e.state === code && !e.online)}));
