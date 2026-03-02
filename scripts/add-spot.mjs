#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(__dirname, '../public/spots.v1.json');
const publicDir = resolve(__dirname, '../public');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const VALID_CATEGORIES = ['park', 'club', 'tournament'];

async function askRequired(prompt) {
  while (true) {
    const val = (await ask(prompt)).trim();
    if (val) return val;
    console.log('  This field is required.');
  }
}

async function askCoord(prompt) {
  while (true) {
    const raw = (await ask(prompt)).trim();
    const num = parseFloat(raw);
    if (!isNaN(num) && raw !== '') return num;
    console.log('  Enter a valid number (e.g. 42.3736).');
  }
}

async function askCategory() {
  while (true) {
    const raw = (await ask('  Category (park/club/tournament) [park]: ')).trim().toLowerCase() || 'park';
    if (VALID_CATEGORIES.includes(raw)) return raw;
    console.log(`  Must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }
}

function askOptional(prompt) {
  return ask(prompt).then((v) => v.trim() || null);
}

async function askUrl(prompt) {
  while (true) {
    const val = (await ask(prompt)).trim() || null;
    if (!val) return null;
    try {
      new URL(val);
      return val;
    } catch {
      console.log('  Enter a valid URL (https://...) or leave blank to skip.');
    }
  }
}

function askPhoto(prompt) {
  return ask(prompt).then((v) => {
    const val = v.trim() || null;
    if (!val) return null;
    const rel = val.startsWith('/') ? val : '/' + val;
    const onDisk = resolve(publicDir, rel.slice(1));
    if (!existsSync(onDisk)) {
      console.log(`  Warning: ${onDisk} doesn't exist yet — make sure to add it before deploying.`);
    }
    return rel;
  });
}

function extractCoordsFromGmapUrl(url) {
  // !2m2!1d<lng>!2d<lat> — actual place coords in the data block (most precise)
  const m2Match = url.match(/!2m2!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/);
  if (m2Match) return { lat: parseFloat(m2Match[2]), lng: parseFloat(m2Match[1]) };

  // !3d<lat> and !2d<lng> — another data block format
  const d3d2 = url.match(/!3d(-?\d+\.\d+).*?!2d(-?\d+\.\d+)/);
  if (d3d2) return { lat: parseFloat(d3d2[1]), lng: parseFloat(d3d2[2]) };
  const d2d3 = url.match(/!2d(-?\d+\.\d+).*?!3d(-?\d+\.\d+)/);
  if (d2d3) return { lat: parseFloat(d2d3[2]), lng: parseFloat(d2d3[1]) };

  // /@lat,lng — map viewport center (good for /place/ URLs, approximate for /dir/ URLs)
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

  // ll=, q=, center= query params
  try {
    const u = new URL(url);
    for (const key of ['ll', 'q', 'center']) {
      const val = u.searchParams.get(key);
      if (val) {
        const parts = val.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return { lat: parts[0], lng: parts[1] };
        }
      }
    }
  } catch {}

  // /place/lat,lng
  const placeMatch = url.match(/\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (placeMatch) return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };

  return null;
}

const spots = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const existingIds = new Set(spots.map((s) => s.id));

console.log('\n  Add a new spot\n');

const name = await askRequired('  Name: ');
const gmap = await askUrl('  Google Maps link (optional, coords extracted automatically): ');

let lat, lng;
if (gmap) {
  const coords = extractCoordsFromGmapUrl(gmap);
  if (coords) {
    lat = coords.lat;
    lng = coords.lng;
    console.log(`  Extracted coords: ${lat}, ${lng}`);
  } else {
    console.log('  Could not extract coords from URL, enter manually:');
  }
}
if (lat === undefined) lat = await askCoord('  Lat: ');
if (lng === undefined) lng = await askCoord('  Lng: ');

const category = await askCategory();
const website  = await askUrl('  Website (optional): ');
const photo    = await askPhoto('  Photo path e.g. /img/photo.png (optional): ');
const notes    = await askOptional('  Notes (optional): ');

let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
if (existingIds.has(id)) {
  let n = 2;
  while (existingIds.has(`${id}_${n}`)) n++;
  id = `${id}_${n}`;
  console.log(`  ID "${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}" already taken, using "${id}".`);
}

const spot = { id, name, lat, lng, category };
if (photo)   spot.photo = photo;
if (gmap)    spot.gmap = gmap;
if (website) spot.website = website;
if (notes)   spot.notes = notes;

spots.push(spot);
writeFileSync(jsonPath, JSON.stringify(spots, null, 2) + '\n', 'utf-8');

console.log(`\n  Added "${spot.name}" (${spots.length} total spots)\n`);
rl.close();
