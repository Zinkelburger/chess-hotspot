import { createHash } from 'node:crypto';

/** Keep page history and URLs stable; scrape timestamps are not content changes. */
export function updateCatalog(previous, events, now) {
  const records = new Map(previous.map(record => [record.event.id, record]));
  for (const source of events) {
    const event = JSON.parse(JSON.stringify(source));
    event.sources = (event.sources || []).map(({ fetchedAt, ...ref }) => ref);
    delete event.reviewFlags;
    const contentHash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const old = records.get(event.id);
    records.set(event.id, {
      event,
      contentHash,
      updatedAt: old?.contentHash === contentHash ? old.updatedAt : now,
    });
  }
  return [...records.values()].sort((a,b) => a.event.id.localeCompare(b.event.id));
}
