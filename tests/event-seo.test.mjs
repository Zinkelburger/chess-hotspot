import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateCatalog } from '../lib/event-catalog.mjs';
import { eventJsonLd, eventPath, safeJsonLd } from '../lib/event-seo.ts';
const event = { id:'sample-open', name:'Sample Open', type:'tournament', date:'2026-10-10', endDate:'2026-10-11', venue:'Chess Club', address:'12 Main Street',city:'Boston',state:'MA',lat:42,lng:-71,locationPrecision:'city',entryFeeUsdMin:0,sources:[{id:'uscf',url:'https://example.org/event',fetchedAt:'2026-10-01'}] };
test('catalog preserves retired URLs and only changes lastmod for content changes',()=>{
 const first=updateCatalog([], [event], '2026-10-01T00:00:00Z');
 const refreshed=updateCatalog(first,[{...event,sources:[{...event.sources[0],fetchedAt:'2026-10-02'}]}],'2026-10-02T00:00:00Z');
 assert.deepEqual(refreshed,first);
 assert.deepEqual(updateCatalog(first,[],'2026-10-03T00:00:00Z'),first);
 const changed=updateCatalog(first,[{...event,name:'Renamed Open'}],'2026-10-04T00:00:00Z');
 assert.equal(changed[0].updatedAt,'2026-10-04T00:00:00Z');
 assert.equal(eventPath(changed[0].event),eventPath(event));
 assert.equal(first[0].event.sources[0].fetchedAt,undefined);
});
test('event schema uses real dates without inventing times, exact coordinates or ticket offers',()=>{
 const schema=eventJsonLd(event,'2026-10-03');
 assert.equal(schema.startDate,'2026-10-10');
 assert.equal(schema.endDate,'2026-10-11');
 assert.equal(schema.location.geo,undefined);
 assert.equal(schema.offers,undefined);
 assert.equal(schema.url,'https://chesshotspot.com/events/sample-open');
 assert.equal(eventJsonLd({...event,locationPrecision:'venue'},'2026-10-03').location.geo.latitude,42);
});
test('schema excludes unsupported or ambiguous events',()=>{
 for(const change of [{online:true},{address:undefined},{endDate:'2026-12-30'},{registrationText:'Members-only event'},{date:'2026-09-01',endDate:'2026-09-02'}])
  assert.equal(eventJsonLd({...event,...change},'2026-10-03'),null);
});
test('JSON-LD cannot close its script element with source-supplied text',()=>{
 const value={name:'</script><script>alert(1)</script>\u2028'};
 const serialized=safeJsonLd(value);
 assert.equal(serialized.includes('</script>'),false);
 assert.deepEqual(JSON.parse(serialized),value);
});
