# Chess Hotspot
<https://chesshotspot.com>

Just wanna have all the chess clubs/parks in one place so I can search them and easily find games in new places.

1. Create file `.env.local` containing `NEXT_PUBLIC_MAP_STYLE=https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json`

2. `pnpm dev`

Goal: only show very active spots
Continuously verify and remove inactive spots

What does a user want to do?
Casual/non-master user wants to play chess and find events near them
- Find active chess clubs in their area
- Filter by day of the week, easily see the times

- Find events near them (not necessarily competitive tournaments)
- Find/filter tournaments near them
  - prize fund
  - strength of the pool (U1800, Open, etc.)
  - location (visible on map)
  - dates/times (can be adjusted with a slider)
  - link to club website
  - picture of tournament hall

TODO:
- Lower PNG resolution sizes

Stretch idea:
- "live hotspots" of where people are playing chess right now, can organize a temporary meetup via the app

## Event scrapers (Python)

Run:

`pnpm events:scrape:py`

Output:

`public/events.v1.json`

Current implementation:

- `scripts/events_scrapers/base.py`: abstract base + shared event model
- `scripts/events_scrapers/cca.py`: CCA scraper
  - starts at `https://www.chesstour.com/refs.html`
  - collects tournament links
  - prefers non-blitz canonical pages (e.g. keeps `aco26.htm`, drops `acob26.htm`)
  - parses broad metadata from event pages (dates, schedule, prizes, sections, fees, ratings, contact, full text)
