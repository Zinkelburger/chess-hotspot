import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path, 'utf8');
const sitemap = read('out/sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.equal(new Set(urls).size,urls.length,'duplicate sitemap URLs');
assert.ok(read('out/robots.txt').includes('Sitemap: https://chesshotspot.com/sitemap.xml'));
const catalog = JSON.parse(read('data/event-pages.json'));
let eventSchemas=0;
for(const url of urls){
 const path=new URL(url).pathname;
 const html=read(path==='/'?'out/index.html':`out${path}.html`);
 const canonical=[...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/g)];
 assert.equal(canonical.length,1,`${path}: exactly one canonical`);
 assert.ok(canonical[0][0].includes(`href="${url}"`),`${path}: canonical mismatch`);
 assert.ok(!/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html),`${path}: noindex in sitemap`);
 assert.equal((html.match(/<h1\b/g)||[]).length,1,`${path}: one primary heading`);
 for(const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)){
  const schema=JSON.parse(match[1]);
  if(schema['@type']==='Event'){
   eventSchemas++;
   assert.equal(schema.url,url);
   assert.match(schema.startDate,/^\d{4}-\d{2}-\d{2}$/);
   assert.equal(schema.offers,undefined);
  }
 }
 for(const match of html.matchAll(/href="(\/(?:events|tournaments)[^"?#]*)"/g))
  // A page exports as <path>.html; a data file (the finder's JSON) as itself.
  assert.ok(fs.existsSync(`out${match[1]}.html`) || (fs.existsSync(`out${match[1]}`) && fs.statSync(`out${match[1]}`).isFile()),`${path}: broken internal link ${match[1]}`);
}
const today=new Date().toISOString().slice(0,10);
const live=new Set(JSON.parse(read('public/events.v1.json')).map(e=>e.id));
for(const {event} of catalog){
 const path=`/events/${encodeURIComponent(event.id)}`;
 const html=read(`out${path}.html`);
 const active=!event.cancellationEvidence && (event.endDate||event.date)>=today && live.has(event.id);
 assert.equal(urls.includes(`https://chesshotspot.com${path}`),active,`${path}: sitemap eligibility`);
 if(!active) assert.match(html,/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/);
}
console.log(`SEO export checks passed: ${urls.length} sitemap URLs, ${catalog.length} permanent event pages, ${eventSchemas} Event schemas.`);
