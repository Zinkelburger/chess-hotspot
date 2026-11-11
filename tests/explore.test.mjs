import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFeed,
  clubItem,
  clubMatches,
  clubSchedule,
  clubWebsites,
  dateWindow,
  defaultFilters,
  displayName,
  eventFormats,
  eventItem,
  eventMatches,
  filtersFromParams,
  filtersToParams,
  isListedClub,
  isListedEvent,
  itemHash,
  parseItemHash,
  searchItems,
  tidyAddress,
  weekendRange,
} from "../lib/explore.ts";

// 2026-11-10 is a Tuesday.
const TODAY = "2026-11-10";
const f = (patch = {}) => ({ ...defaultFilters, ...patch });
const club = (patch = {}) => ({
  id: "c",
  name: "Elm Street Chess Club",
  lat: 42,
  lng: -71,
  category: "club",
  hours: { Tuesday: { open: "19:00" }, Saturday: { open: "10:00", close: "14:30" } },
  ...patch,
});
const event = (patch = {}) => ({
  id: "e",
  name: "Boston Open",
  date: "2026-11-14",
  endDate: "2026-11-15",
  type: "tournament",
  city: "Boston",
  state: "MA",
  format: "classical",
  lat: 42.3,
  lng: -71,
  ...patch,
});

test("only mapped clubs that meet and were not weeded out are listed", () => {
  assert.equal(isListedClub(club()), true);
  assert.equal(isListedClub(club({ skip: true })), false);
  assert.equal(isListedClub(club({ has_weekly_club_meetings: false })), false);
  assert.equal(isListedClub(club({ lat: null })), false);
});

test("past, cancelled and placeholder tournaments are not listed", () => {
  assert.equal(isListedEvent(event(), TODAY), true);
  assert.equal(isListedEvent(event({ date: "2026-11-01", endDate: "2026-11-02" }), TODAY), false);
  assert.equal(isListedEvent(event({ date: "2026-11-08", endDate: "2026-11-10" }), TODAY), true);
  assert.equal(isListedEvent(event({ cancellationEvidence: "Cancelled" }), TODAY), false);
  assert.equal(isListedEvent(event({ name: "Sample - Quads", date: "2040-09-29", endDate: "2040-09-29" }), TODAY), false);
  assert.equal(isListedEvent(event({ date: "2040-09-29", endDate: "2040-09-29" }), TODAY), false);
});

test("the weekend runs Friday to Sunday, or what is left of it", () => {
  assert.deepEqual(weekendRange("2026-11-10"), { from: "2026-11-13", to: "2026-11-15" });
  assert.deepEqual(weekendRange("2026-11-14"), { from: "2026-11-14", to: "2026-11-15" });
  assert.deepEqual(weekendRange("2026-11-15"), { from: "2026-11-15", to: "2026-11-15" });
  assert.deepEqual(dateWindow(f({ when: "custom", from: "2026-11-01", to: "2026-11-20" }), TODAY), {
    from: TODAY,
    to: "2026-11-20",
  });
});

test("clubs follow the day and date filters by their meeting days", () => {
  assert.equal(clubMatches(club(), f(), TODAY), true);
  assert.equal(clubMatches(club(), f({ days: ["Tuesday"] }), TODAY), true);
  assert.equal(clubMatches(club(), f({ days: ["Wednesday"] }), TODAY), false);
  assert.equal(clubMatches(club(), f({ when: "today" }), TODAY), true); // a Tuesday
  assert.equal(clubMatches(club(), f({ when: "today" }), "2026-11-11"), false);
  assert.equal(clubMatches(club(), f({ when: "weekend" }), TODAY), true); // Saturday
  assert.equal(clubMatches(club(), f({ when: "weekend", days: ["Sunday"] }), TODAY), false);
  // No known meeting day: shown by default, never promised for a given day.
  assert.equal(clubMatches(club({ hours: undefined }), f(), TODAY), true);
  assert.equal(clubMatches(club({ hours: undefined }), f({ when: "today" }), TODAY), false);
});

test("choosing a time control or big events leaves only tournaments", () => {
  assert.equal(clubMatches(club(), f({ formats: ["blitz"] }), TODAY), false);
  assert.equal(clubMatches(club(), f({ big: true }), TODAY), false);
  assert.equal(clubMatches(club(), f({ kinds: ["tournament"] }), TODAY), false);
  assert.equal(eventMatches(event(), f({ kinds: ["club"] }), TODAY), false);
});

test("tournaments match on dates, weekdays, speed and prize fund", () => {
  assert.equal(eventMatches(event(), f(), TODAY), true);
  assert.equal(eventMatches(event(), f({ when: "today" }), TODAY), false);
  assert.equal(eventMatches(event(), f({ when: "weekend" }), TODAY), true);
  assert.equal(eventMatches(event(), f({ days: ["Sunday"] }), TODAY), true);
  assert.equal(eventMatches(event(), f({ days: ["Monday"] }), TODAY), false);
  // Only the days still inside the window count.
  assert.equal(eventMatches(event(), f({ when: "custom", from: "2026-11-15", to: "2026-11-15", days: ["Saturday"] }), TODAY), false);
  // A series running for weeks covers every weekday.
  assert.equal(eventMatches(event({ date: "2026-11-01", endDate: "2026-12-20" }), f({ days: ["Monday"] }), TODAY), true);
  assert.equal(eventMatches(event(), f({ formats: ["blitz"] }), TODAY), false);
  const mixed = event({ format: "custom", timeControls: [{ kind: "rapid" }, { kind: "blitz" }] });
  assert.deepEqual(eventFormats(mixed), ["rapid", "blitz"]);
  assert.equal(eventMatches(mixed, f({ formats: ["blitz"] }), TODAY), true);
  assert.equal(eventMatches(event(), f({ big: true }), TODAY), false);
  assert.equal(eventMatches(event({ prizeFundUsd: 12000 }), f({ big: true }), TODAY), true);
});

test("filters survive a round trip through the URL", () => {
  const filters = f({ kinds: ["tournament"], formats: ["rapid", "blitz"], days: ["Friday", "Sunday"], when: "weekend", big: true });
  const params = filtersToParams(filters);
  assert.equal(params.toString(), "find=tournaments&play=rapid%2Cblitz&day=fri%2Csun&when=weekend&big=1");
  assert.deepEqual(filtersFromParams(params), filters);
  assert.equal(filtersToParams(f()).toString(), "");
  const custom = f({ when: "custom", from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(filtersFromParams(filtersToParams(custom)), custom);
  assert.deepEqual(filtersFromParams(new URLSearchParams("from=nonsense&play=bullet&day=xyz")), f());
});

test("a page that starts on clubs only says so in the URL when that changes", () => {
  const base = f({ kinds: ["club"] });
  assert.equal(filtersToParams(base, base).toString(), "");
  assert.deepEqual(filtersFromParams(new URLSearchParams(""), base), base);
  assert.equal(filtersToParams(f(), base).toString(), "find=all");
  assert.deepEqual(filtersFromParams(new URLSearchParams("find=all"), base), f());
});

test("popup links name the listing", () => {
  const item = eventItem(event({ id: "uscf-1 2" }));
  assert.equal(itemHash(item), "#event=uscf-1%202");
  assert.deepEqual(parseItemHash("#event=uscf-1%202"), { kind: "tournament", id: "uscf-1 2" });
  assert.deepEqual(parseItemHash("#club=elm"), { kind: "club", id: "elm" });
  assert.equal(parseItemHash("#other"), null);
});

test("club schedules, links and addresses are worded for people", () => {
  assert.deepEqual(clubSchedule(club()), [
    { day: "Tuesday", text: "from 7 PM" },
    { day: "Saturday", text: "10 AM – 2:30 PM" },
  ]);
  const spot = club({ website: ["https://good.example", "https://wrong.example"], website_confidence: { "https://wrong.example": "mismatch" } });
  assert.deepEqual(clubWebsites(spot), ["https://good.example"]);
  assert.equal(tidyAddress("8629 JM Keynes Drive Charlotte , NC 28262 United States"), "8629 JM Keynes Drive Charlotte, NC 28262");
});

test("names typed in capitals are set in title case; others are left alone", () => {
  assert.equal(displayName("MARSHALL $700 FIDE BLITZ"), "Marshall $700 FIDE Blitz");
  assert.equal(displayName("WEEKLY U2200"), "Weekly U2200");
  assert.equal(displayName("24TH ANNUAL TURKEY BOWL"), "24th Annual Turkey Bowl");
  assert.equal(displayName("TIM JUST WINTER OPEN XLIII"), "Tim Just Winter Open XLIII");
  assert.equal(displayName("CKQ SUPER SUNDAY"), "CKQ Super Sunday");
  assert.equal(displayName("KING OF THE HILL"), "King of the Hill");
  assert.equal(displayName("Marshall PREMIER FIDE Open"), "Marshall PREMIER FIDE Open");
  assert.equal(displayName("FMCA"), "FMCA");
});

test("search ranks a name that starts with the query first", () => {
  const items = [
    eventItem(event({ id: "1", name: "Greater Boston Open" })),
    clubItem(club({ id: "2", name: "Boston Chess Club" })),
    eventItem(event({ id: "3", name: "Fall Classic", city: "Boston" })),
    eventItem(event({ id: "4", name: "Denver Open", city: "Denver", state: "CO" })),
  ];
  assert.deepEqual(searchItems(items, "boston").map((item) => item.id), ["2", "1", "3"]);
  assert.deepEqual(searchItems(items, "  "), []);
});

test("the feed groups by date and writes club nights out for the week", () => {
  const items = [
    clubItem(club()),
    clubItem(club({ id: "quiet", name: "Quiet Corner", hours: undefined })),
    eventItem(event()),
    eventItem(event({ id: "now", name: "Fall Open", date: "2026-11-09", endDate: "2026-11-11" })),
    eventItem(event({ id: "league", name: "City League", date: "2026-01-03", endDate: "2026-12-31" })),
  ];
  const feed = buildFeed(items, f(), TODAY);
  assert.deepEqual(
    feed.map((group) => [group.label, group.entries.map((entry) => entry.item.id)]),
    [
      ["Happening now", ["now"]],
      ["Today · Tue, Nov 10", ["c"]],
      ["Sat, Nov 14", ["e", "c"]],
      ["Ongoing series and leagues", ["league"]],
      ["Clubs · ask for meeting times", ["quiet"]],
    ],
  );
  // A Tuesday-only filter keeps the Tuesday club night and drops Saturday's.
  const tuesdays = buildFeed([items[0]], f({ days: ["Tuesday"] }), TODAY);
  assert.deepEqual(tuesdays.map((group) => group.label), ["Today · Tue, Nov 10"]);
});
