import type { ChessEvent } from '../types/event';

export const SITE_URL = 'https://chesshotspot.com';
export const eventPath = (event: Pick<ChessEvent, 'id'>) => `/events/${encodeURIComponent(event.id)}`;
export const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const dateRange = (event: ChessEvent) => event.endDate && event.endDate !== event.date ? `${dateLabel(event.date)} – ${dateLabel(event.endDate)}` : dateLabel(event.date);
export const placeLabel = (event: ChessEvent) => event.online ? 'Online' : [event.city, event.state].filter(Boolean).join(', ') || event.venue || 'United States';
export function eventDescription(event: ChessEvent) {
  return `${event.name} in ${placeLabel(event)}. ${dateRange(event)}.${event.venue && !event.online ? ` At ${event.venue}.` : ''} View the schedule, entry information, rating sections and organizer links.`;
}
export function eventJsonLd(event: ChessEvent, today: string) {
  const days = (Date.parse(event.endDate || event.date) - Date.parse(event.date)) / 86400000;
  const membership = [event.entryFeeText, event.registrationText, event.notes].filter(Boolean).join(' ');
  // Only dated, physical occurrences with a stated venue address qualify here.
  // A months-long recurring window must not masquerade as one continuous event.
  if (event.online || !event.address || !event.venue || !event.city || !event.state || days < 0 || days > 7 || (event.endDate || event.date) < today ||
      /(?:must be (?:a )?[^.\n]*member|members?[- ]only|memberships?(?: is)? required|invitation[- ]only)/i.test(membership)) return null;
  const location: Record<string, unknown> = {
    '@type': 'Place', name: event.venue,
    address: { '@type': 'PostalAddress', streetAddress: event.address, addressLocality: event.city, addressRegion: event.state, addressCountry: 'US' },
  };
  if (event.locationPrecision === 'venue' && event.lat != null && event.lng != null)
    location.geo = { '@type': 'GeoCoordinates', latitude: event.lat, longitude: event.lng };
  return {
    '@context': 'https://schema.org', '@type': 'Event',
    '@id': `${SITE_URL}${eventPath(event)}#event`, url: `${SITE_URL}${eventPath(event)}`,
    name: event.name, description: eventDescription(event),
    startDate: event.date, endDate: event.endDate || event.date,
    eventStatus: event.cancellationEvidence ? (/postponed/i.test(event.cancellationEvidence) ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventCancelled') : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location,
    ...(event.organizer ? { organizer: { '@type': 'Organization', name: event.organizer } } : {}),
    // Conditional fees do not establish a purchasable offer or ticket availability.
  };
}
export const safeJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
