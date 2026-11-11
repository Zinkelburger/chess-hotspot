import fs from 'node:fs';
import { updateCatalog } from '../lib/event-catalog.mjs';

const path = 'data/event-pages.json';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const events = read('public/events.v1.json');
// Cancellations leave discovery but their published pages must explain what changed.
const cancelled = fs.readdirSync('data/event-sources').filter(f => f.endsWith('.json'))
  .flatMap(f => read(`data/event-sources/${f}`)).filter(e => e.cancellationEvidence);
const previous = fs.existsSync(path) ? read(path) : [];
const records = updateCatalog(previous, [...events, ...cancelled], new Date().toISOString());
fs.writeFileSync(`${path}.tmp`, JSON.stringify(records, null, 2) + '\n');
fs.renameSync(`${path}.tmp`, path);
console.log(`Prepared ${records.length} permanent event pages.`);
