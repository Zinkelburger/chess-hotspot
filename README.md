# Chess Hotspot
<https://chesshotspot.com>

Just wanna have all the chess clubs/parks in one place so I can search them and easily find games in new places.

Three pages with one layout (a filterable list beside a map): clubs (`/`),
tournaments (`/tournaments`), and coaches & schools (`/learn`). How the data is
gathered and refreshed is in [docs/event-directory.md](docs/event-directory.md).

1. Create file `.env.local` containing `NEXT_PUBLIC_MAP_STYLE=https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json`

2. `pnpm dev`

## Future: self-hosted map tiles

If Carto CDN tile loading becomes too slow at scale, switch to self-hosted PMTiles on Cloudflare R2. Host a single `.pmtiles` basemap file from https://maps.protomaps.com/builds/ on R2 (free egress, ~cents/month storage). Uses `pmtiles` + `@protomaps/basemaps` npm packages with MapLibre's `addProtocol` API. See https://docs.protomaps.com/pmtiles/.

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

- Incentives for contributing
- Leaderboard/karma score. Titles/achievements
- "just steal everything from gacha games"

- Investigate all clubs with no hours?

- "OSM has a specific, official tag for chess: sport=chess. People use this to tag giant outdoor chess boards, permanent park tables, and public chess pavilions.
How to get the data: You can use the Overpass API (a tool built for querying OSM data). You can literally write a query that says, "Give me the latitude and longitude of every single location on Earth tagged with sport=chess"

- scrape chess reddit api for chess in the park + city name

- meetup.com

- ChessPlaces.com or the European Chess Union's ChessWhere project.
- https://www.chess-la.com/
- https://sites.google.com/site/louisianachess/chess-club-locations-info

- How to get images for all sites? Seems very time consuming

- Search Bar (I.e. "Denver" boom you're zoomed to denver)

# Chess.com postprocessing
Cursor prompt:
Each chess club: please identify is it a real club, a meme, etc. Its a big file, i suggest tou find some way to go entry-by-entry

For each club, if it seems to be a real club (member count >1, not a meme, references a real life place), put it in its own file. Like chesscom_postprocessed.json or something. Skip high school and middle school clubs. College clubs are generally open to the public in my expereince, so keep those in.

## The map

The whole site is one screen, modelled on [bostonsalsa.org](https://bostonsalsa.org):
a full-height map, a floating search box, and one bar of filter pills.

- **Pins.** Green is a club, blue is a tournament, a gold ring marks a tournament
  with $5,000 or more in prizes. Tournaments pinned to the same ZIP code share one
  numbered pin; tapping it lists them.
- **Filter bar.** Four labelled rows, nothing hidden behind a menu: Find (clubs,
  tournaments), Play (classical, rapid, blitz), Day, and When (today, this weekend,
  custom dates, big events). On a phone each row is a rail you swipe.
- **Popup.** A pin, feed card or search result opens a card (a bottom sheet on a
  phone) with the facts on top and the links pinned to the bottom. It puts
  `#club=<id>` or `#event=<id>` in the URL, so it can be shared and Back closes it.
- **Feed.** The Feed button turns the same listings into a dated list. Weekly club
  nights are written out for the coming week next to the tournaments.
- **Search.** One box finds a club, a tournament, or a town to fly to.

Filters live in the query string (`/?find=tournaments&play=blitz&when=weekend`).
`/clubs` is the same map opened with Clubs selected.

Code: `app/components/Explore.tsx` ties it together; `lib/explore.ts` holds the
filter, feed and search logic (tested in `tests/explore.test.mjs`). The browser
loads `/explore-data.json`, built from `public/spots.v1.json` and
`public/events.v1.json` with only the listings that can be shown.

```sh
python3 -m pip install -r scripts/requirements.txt
npm run events:refresh
```

Sources: US Chess, NA Chess Hub (including MACA registrations), Boylston, and
Continental Chess. Direct MACA ingestion is blocked by its unavailable website.
Source health and approximate map locations are visible in the directory.

See [directory and scraper operations](docs/event-directory.md) for source
research, the on-demand agent refresh workflow, safeguards, geocoding attribution, and tests. Ask the agent "Refresh the chess events" to run it. No refresh is scheduled.

## Searchable tournament pages

The static export includes permanent `/events/[id]` pages, state calendars at
`/tournaments/[state]`, `/events/online`, `/sitemap.xml`, and `/robots.txt`.
Every build refreshes the page catalog and verifies sitemap URLs, canonical tags,
internal links, and event structured data. Keep `data/event-pages.json` in data
updates so expired URLs continue to resolve with a clear status.

Run `npm run build` followed by `npm run preview` to inspect the export locally.
See the [SEO and publishing notes](docs/event-directory.md#searchable-event-pages)
for indexing behavior and Search Console setup after deployment.

## USCF club import & fill (Python)

1. **Scrape** USCF clubs: `python3 scripts/scrape_clubs.py` → `data/uscf_clubs.json`
2. **Import** into spots: `pnpm spots:import:uscf` — adds all clubs with blank lat/lng/photo/gmap
3. **Fill** one by one: `pnpm spots:fill` — walks through each blank club, prompts for Maps link, image, etc.

The fill script shows USCF context (city, address, email) for each club and:

- Extracts lat/lng from any Google Maps URL you paste
- Generates a standard image filename (`/img/{club_id}.{ext}`) — just provide the extension
- Automatically picks up where you left off — only shows clubs that still need coordinates
