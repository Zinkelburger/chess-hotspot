# Tournament directory and scraper operations

The site has three pages, one per job, and all three are the same layout
(`app/components/FinderShell.tsx`): the brand and a three-way switcher across the
top, search and filter pills under it, then a list with the map beside it. On a
phone the list fills the screen and a floating button swaps it for the map.
Every page takes a place (city, ZIP code or device location, with a radius) or a
state, sorts, and can "list only what is on the map". Filters and sort order are
in the URL; the chosen place is remembered in the browser and shared by all
three pages.

- `/` (and `/clubs`) lists clubs: filter by the day they meet, sort by state,
  distance, name, or "this week, day by day".
- `/tournaments` is a sortable table: narrow by date, time control, FIDE rating,
  length, prize fund and audience; every column header sorts.
- `/learn` is the coaches & schools directory (see the last section).

Dates use the viewer's local day; ongoing multi-day events remain visible, and a
series that started before today is listed after the dated events. Tournaments
that share coordinates share one numbered pin; online events appear in the table
only. Links made before the finder existed (`/#event=<id>`) forward to it.

The "Entry" column shows the first price in the organizer's fee text and says
"varies" when more follow. It is a scanning aid, not a quote; the full text is in
the detail card.

## Sources investigated on October 2–3, 2026

| Source | Implemented ingestion | Coverage and limitations |
| --- | --- | --- |
| [US Chess](https://new.uschess.org/upcoming-tournaments) | All directory pages, then every unique detail page | National advertised tournaments; this is not a registry of all rated events. The latest index scrape follows 29 pages; additional known unexpired occurrences are rechecked on their detail pages. Structured online/address/FIDE fields are used. Recurring listings use the upcoming occurrence displayed in the directory, not the series' original start date. |
| [NA Chess Hub](https://www.nachesshub.com/AllEvents) | Paginated event table and detail fields | US locations only; includes MACA registrations. Explicit organizer test events are excluded. |
| [Boylston](https://boylstonchess.org/events) | Structured list underlying its [calendar](https://boylstonchess.org/calendar) | Tournaments, club nights, lessons and talks. Membership products, board/annual meetings and league team-signup products are excluded. Yearless Tuesday series retain their full first-to-last-date window. |
| [MACA](http://www.masschess.org/Events/chess-event-list.aspx) | Its published future-events sheet, then each event's page on masschess.org | Massachusetts and nearby New England. The site answers only over plain HTTP; HTTPS connections are reset, which is why it looked unavailable in October. TV notices, club announcements, camps and single-round rows of tournaments already under way are excluded, as are club nights with no time control. Events still marked TBD have no location. A failure here does not block publication, because the site has been unreliable and NA Chess Hub also carries MACA registrations. |
| [Continental Chess](https://www.chesstour.com/refs.html) | Existing detail-page scraper, improved title/address parsing | Only events published in that index. Preserves the existing CCA schema and parser tests. |
| [King Registration](https://www.kingregistration.com/tournaments) | JSON embedded in its tournament list, then each public event page | One registration platform used by about 80 organizers, strongest in IL, TX, WI, AZ and CA. Only events its organizers register there. Postal/ICCF play, after-school classes, club meetings, camps, simuls, bundles and internal test listings are excluded. It publishes no robots.txt and its terms do not restrict reading; `/register` and entry lists are not fetched. Prices with no organizer wording are the platform's current online fee and say so. |
| [Mechanics' Institute](https://www.milibrary.org/chess/tournaments/) | Its tournament list, then each tournament page | Club tournaments in San Francisco currently on its list. Dates come from each tournament's page because the list prints no year. Entry fees keep the member and non-member wording. |
| [Marshall Chess Club](https://www.marshallchessclub.org/tournaments/upcoming) | Table on its registration page | Club tournaments in New York, about two months ahead. Classes and casual nights are excluded. The page prints no year, so it is taken from the date nearest today, advancing at New Year. Many events are members-only; the fee text says which. |
| [ChessReg](https://chessreg.com) | Its [documented public API](https://chessreg.com/webservice-api-v1-documentation) | Registration platform for Washington, Idaho and nearby, mostly scholastic and NWSRS-rated. Only events registered there. The API gives a start date only, so multi-day events show their first day. Prices are the listed online fee. |

No documented public upcoming-tournament RSS/ICS/API feed was found on US Chess.
Their [August 2026 API announcement](https://forum.uschess.org/t/api-2-0-is-now-available/61581)
concerns membership and ratings supplements, not the upcoming-events directory.
The [Plan Ahead Calendar](https://new.uschess.org/plan-ahead-calendar) is useful for
major events but explicitly has narrower coverage. The public upcoming-tournaments
directory remains the best verified national source for this implementation.

## Refresh locally

```sh
python3 -m pip install -r scripts/requirements.txt
python3 scripts/scrape_events.py --strict
```

A cold run fetches hundreds of pages and can take 15–30 minutes. Requests are
sequential per source, have a descriptive user agent, a 25-second timeout, at least
350 ms between requests, a six-hour HTML cache, and bounded retries for transient HTTP failures. A process lock prevents concurrent refresh writers. `--sources` supports selective
refreshes without deleting the other sources. The default source list includes every working adapter. `--strict` exits nonzero after writing health
reports if any requested source fails. No login or private endpoint is required.

Files:

- `data/event-sources/*.json`: last successful per-source snapshots, including past listings.
- `data/event-geocodes.json`: reusable geographic lookups.
- `public/events.v1.json`: validated, deduplicated public events.
- `public/events-status.json`: per-source attempt/success times, counts, errors, map coverage, and quality summary.
- `public/events-review.json`: detailed review queue with source URLs, coverage, cancellations, mixed controls, long date ranges, and cross-source conflicts.
- `data/event-http-cache/`, `data/geonames/`: ignored local caches.

A failed/empty scrape, invalid data, failed US Chess detail page, or count drop of
more than 50% retains that source's previous snapshot. Successful source snapshots can still refresh for review, but any blocking source or quality issue retains the prior public directory. Writes replace files atomically.
US Chess can remove started tournaments and advance recurring occurrences in its upcoming index. Previously observed, unexpired occurrences are rechecked against their detail-page dates or recurrence rules before being retained, and are flagged in the review report. Expired series and cancellations are excluded. A one-day retention buffer protects US events across midnight UTC; the browser
hides events that have ended according to the viewer's local date.

New adapters identify events by source URL and occurrence date, so title edits do
not create new IDs. Deduplication retains all source links and merges, in order:

1. shared URLs on the same date;
2. a US Chess ad citing exactly one King Registration page, on that page's date
   (an ad citing several pages may be promoting side events, so it identifies none);
3. exact normalized title/date/city/state matches;
4. listings from different sources with the same start date, end date, city and
   state whose titles agree once editions, years, months and filler are removed
   (`scripts/event_merge.py`). Titles differing by a word that separates
   competitions, such as "Blitz" or "Scholastic", never merge. A set of listings is
   merged only if every source appears once and all the titles agree; otherwise it is
   flagged `possible-duplicate-listing`, as are same-day, same-city listings sharing
   two distinctive words that were left apart.

A wrong merge hides a real event, so anything looser is left separate; differently
titled listings of one tournament may still appear twice. `linked-listing-date-differs`
marks an ad and the page it names disagreeing on the date, and
`possibly-cancelled-per-other-source` marks a listing another source reports as
cancelled. Monthly series, weekly occurrences, and schedule variants are not
expanded into invented dates.

## Map precision

Postal/city coordinates come from [GeoNames postal data](https://download.geonames.org/export/zip/)
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). The cached lookup records
store the precision. Boylston's verified club location can be reused across sources when the venue identity and street, city, state, and ZIP all match. A shared ZIP never qualifies as an exact venue match. Other approximate pins are marked in event details and on the map.
Contradictory ZIP/state data remains unmapped; we do not silently choose another
state. Online events never receive physical pins. Users confirm venues and
registration on the linked source page.

## On-demand agent refresh and release

Refreshes run only when requested. Tell the agent **"Refresh the chess events"**.
The agent should:

1. Inspect the working tree and preserve unrelated changes.
2. Run `npm run events:refresh` (the full `scripts/refresh_events.sh` pipeline).
3. Inspect `public/events-status.json` and `public/events-review.json`, including on failure.
4. Check official pages for questionable changes, cancellations, conflicting dates,
   fees, or schedules. Preserve source evidence and conditional wording; fix clear
   parser regressions with a regression test and rerun the relevant checks.
5. Report coverage changes, failures, and unresolved issues. Publication is a separate action.

The command scrapes every working source, validates data, runs tests, and
builds the local site. There is no timer or scheduled task. The optional GitHub
workflow uses `workflow_dispatch` only; when installed, a manually triggered run
opens a data PR after checks pass. It does not run on a schedule.

`.github/workflows/ci.yml` validates pushes and PRs without network requests in
tests. The static export and Cloudflare Pages release process remains separate.

## Detail extraction and release checks

Organizer fee, round-time and registration text is retained with its conditions;
US Chess headings and inline EF/REG/RDS labels are supported. The parser does not
turn hotel rates or conditional titled-player discounts into a numeric entry fee,
and relative deadlines remain text instead of an invented calendar date. Compact ads with multiple EF labels are flagged for review instead of detaching prices from their section eligibility. Long extracts explicitly indicate when they are excerpts.

Multiple controls are retained in `timeControls` and displayed as multiple/special
controls. Each recognized speed remains searchable. Legacy hour notation such as
`40/2, G/1` remains explicitly ambiguous instead of being labelled one-minute blitz.
Explicit side-event sections and cross-promotions are excluded from main controls.
US Chess section labels come from the sections block, so prize classes and eligibility notes do not become playable sections. This is still heuristic extraction: arbitrary prose can need manual review.

Explicit cancellation/postponement notices are excluded from the published feed
and retained in source snapshots with evidence in the review report. Conditional
cancellation policies do not count as notices. Soft-404 US Chess detail pages fail
the source refresh. Contradictory numeric fields fail validation; differing end
dates, online status or formats between merged sources block the strict review.
Required-source failures and success timestamps older than ten days also block it.
An overall upcoming-event count drop greater than 30% also blocks publication. Blocking quality issues retain the prior public directory while successful source snapshots and the review report remain available for diagnosis. Mixed controls and long recurring ranges remain visible with review warnings.

Regenerate the saved-data review without fetching sources:

```sh
python3 scripts/review_events.py --strict
```

Run the full refresh on demand:

```sh
npm run events:refresh
```

These checks establish parse and source-health confidence, not a guarantee that an
organizer has updated a page. Review still needs to consult official listings for
suspicious changes. Precise coordinates remain limited to verified venues; area
pins are labelled on the map, cards, and event detail view.


## Searchable event pages

`npm run build` maintains `data/event-pages.json`, exports the site, then checks
all sitemap entries, canonical URLs, internal event/state links and JSON-LD.
Commit the catalog with data updates: it preserves published URLs when a source
removes a listing. Content hashes keep `lastmod` stable across unchanged scrapes.

- `/events` links state calendars and the next upcoming tournaments.
- `/tournaments/[state]` contains the complete current state listing.
- `/events/[id]` is the permanent, server-rendered event page; IDs survive title edits.
- `/events/online` lists virtual events separately.
- `/sitemap.xml` contains current event pages and populated state listings.
- `/robots.txt` advertises the sitemap. Filter query URLs canonicalize to the map.

Expired, cancelled, and no-longer-confirmed listings retain their pages with a
visible status and `noindex`, and leave the sitemap at the next build. Dates and
status are evaluated at build time, so refreshing/rebuilding is needed to retire
newly expired listings. No background schedule is configured.

Event structured data is limited to dated physical events with a venue and
address. Long recurring windows, known members-only listings and online events
are excluded from that markup. Unknown start times stay date-only, approximate
map coordinates are omitted, and conditional fees are not invented ticket offers.

Run `npm run preview` after a build to inspect the static export at port 3105;
this preview resolves clean URLs the same way as the hosting platform. Publishing
remains a separate action. After publication, submit
`https://chesshotspot.com/sitemap.xml` to the site's Google Search Console property
and inspect representative event and state URLs there.


## Coaches & schools directory

`/learn` lists who teaches chess, from two public directories:

| Source | What is taken | Limits |
| --- | --- | --- |
| US Chess affiliate directory (`data/uscf_clubs_v2.json`, already used for clubs) | Affiliates listing Lessons, Classes or Chess Camps, joined to the hand-checked records in `public/spots.v1.json` for verified websites, notes and exact coordinates | A school's own club is left out (it teaches its own pupils), as are state chapters and affiliates research could not confirm. No phone numbers or e-mail addresses are published. |
| [Lichess coach directory](https://lichess.org/coach) | US-flagged coaches: name, title, FIDE rating, languages, rate text, headline, profile link | The country filter needs a login, so the scraper pages the whole alphabetical list (about 220 requests, two seconds apart, cached for a week). City is free text; about half can be placed on the map, at town precision. E-mail addresses in headlines are removed; contact goes through the Lichess profile. |

Not used: Chess.com's coach list (its terms forbid automated collection), the
US Chess certified-coach list (262 names, no locations; a possible credential
layer later), and FIDE's trainer search (46 US trainers, no city).

```sh
python3 scripts/scrape_lichess_coaches.py   # data/learn-sources/lichess-coaches.json
python3 scripts/build_learn.py              # public/learn.v1.json (no network)
```

Pins come from the same GeoNames postal table as tournaments: a ZIP code when
the address has one, otherwise the town, and are labelled as such. With a place
chosen the page lists what is nearby first, then the coaches elsewhere who teach
online, so a search never ends empty-handed for want of a local coach.
