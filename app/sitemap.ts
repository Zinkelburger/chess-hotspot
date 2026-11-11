import type { MetadataRoute } from 'next';
import { activeEvents, records, statePages } from '@/lib/event-pages';
import { SITE_URL, eventPath } from '@/lib/event-seo';
export const dynamic = 'force-static';
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Map(records.map(r => [r.event.id, r.updatedAt]));
  return [
    {url:SITE_URL}, {url:`${SITE_URL}/tournaments`}, {url:`${SITE_URL}/learn`}, {url:`${SITE_URL}/events`}, {url:`${SITE_URL}/clubs`},
    ...(activeEvents.some(e=>e.online)?[{url:`${SITE_URL}/events/online`}]:[]),
    ...statePages.filter(s=>s.events.length).map(s=>({url:`${SITE_URL}/tournaments/${s.slug}`})),
    ...activeEvents.map(e=>({url:`${SITE_URL}${eventPath(e)}`,lastModified:updated.get(e.id)})),
  ];
}
