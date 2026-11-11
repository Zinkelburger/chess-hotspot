import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRows,
  defaultTFilters,
  eventLength,
  feeHint,
  filterRows,
  groupRows,
  milesBetween,
  relativeDay,
  sortRows,
  tDateWindow,
  tFiltersFromParams,
  tFiltersToParams,
  whereText,
} from "../lib/tournaments.ts";

// 2026-11-10 is a Tuesday.
const TODAY = "2026-11-10";
const BOSTON = { lat: 42.36, lng: -71.06, label: "Boston, MA" };
const f = (patch = {}) => ({ ...defaultTFilters, ...patch });
const event = (patch = {}) => ({
  id: "e",
  name: "Boston Open",
  date: "2026-11-14",
  endDate: "2026-11-15",
  type: "tournament",
  city: "Boston",
  state: "MA",
  format: "classical",
  rated: true,
  ratingSystem: "USCF",
  lat: 42.35,
  lng: -71.06,
  ...patch,
});
const names = (rows) => rows.map((row) => row.event.name);
const find = (events, filters, near = filters.near ?? null) =>
  names(filterRows(buildRows(events, near), filters, TODAY));

test("distance is measured in miles from the visitor's place", () => {
  const worcester = { lat: 42.2626, lng: -71.8023 };
  const miles = milesBetween(BOSTON, worcester);
  assert.ok(miles > 37 && miles < 40, `Boston to Worcester was ${miles}`);
  const [row] = buildRows([event()], BOSTON);
  assert.ok(row.miles < 2);
  assert.equal(buildRows([event()], null)[0].miles, null);
  assert.equal(buildRows([event({ online: true })], BOSTON)[0].miles, null);
});

test("a radius keeps what is close and leaves out what cannot be placed", () => {
  const events = [
    event(),
    event({ id: "w", name: "Worcester Quads", lat: 42.2626, lng: -71.8023, city: "Worcester" }),
    event({ id: "c", name: "Chicago Open", lat: 41.88, lng: -87.63, city: "Chicago", state: "IL" }),
    event({ id: "o", name: "Online Blitz", online: true, lat: undefined, lng: undefined }),
  ];
  assert.deepEqual(find(events, f({ near: BOSTON, radius: 25 })), ["Boston Open"]);
  assert.deepEqual(find(events, f({ near: BOSTON, radius: 50 })), ["Boston Open", "Worcester Quads"]);
  // "Any distance" measures and sorts but never excludes.
  assert.equal(find(events, f({ near: BOSTON, radius: 0 })).length, 4);
  assert.deepEqual(find(events, f({ state: "IL" })), ["Chicago Open"]);
  assert.deepEqual(find(events, f({ mode: "online" })), ["Online Blitz"]);
});

test("date windows include events already under way", () => {
  assert.deepEqual(tDateWindow(f({ when: "weekend" }), TODAY), { from: "2026-11-13", to: "2026-11-15" });
  assert.deepEqual(tDateWindow(f({ when: "30d" }), TODAY), { from: TODAY, to: "2026-12-09" });
  const events = [
    event(),
    event({ id: "l", name: "Later Open", date: "2027-03-06", endDate: "2027-03-07" }),
    event({ id: "u", name: "Under Way", date: "2026-11-08", endDate: "2026-11-11" }),
  ];
  assert.deepEqual(find(events, f({ when: "weekend" })), ["Boston Open"]);
  assert.deepEqual(find(events, f({ when: "30d" })), ["Boston Open", "Under Way"]);
  assert.deepEqual(find(events, f({ when: "custom", from: "2027-03-01", to: "" })), ["Later Open"]);
});

test("format, length, rating, audience and prize filters", () => {
  const events = [
    event({ prizeFundUsd: 12000, fideRated: true }),
    event({ id: "q", name: "Saturday Quads", endDate: "2026-11-14", format: "rapid" }),
    event({ id: "k", name: "K-12 Championship", audience: "scholastic", endDate: "2026-11-14" }),
    event({ id: "s", name: "Tuesday Night Swiss", date: "2026-12-01", endDate: "2026-12-29" }),
  ];
  assert.equal(eventLength(events[0]), "multi");
  assert.equal(eventLength(events[1]), "day");
  assert.equal(eventLength(events[3]), "series");
  assert.deepEqual(find(events, f({ formats: ["rapid"] })), ["Saturday Quads"]);
  assert.deepEqual(find(events, f({ lengths: ["series"] })), ["Tuesday Night Swiss"]);
  assert.deepEqual(find(events, f({ lengths: ["day"] })), ["Saturday Quads", "K-12 Championship"]);
  assert.deepEqual(find(events, f({ fide: true })), ["Boston Open"]);
  assert.deepEqual(find(events, f({ audience: "scholastic" })), ["K-12 Championship"]);
  assert.equal(find(events, f({ audience: "open" })).includes("K-12 Championship"), false);
  assert.deepEqual(find(events, f({ prize: 5000 })), ["Boston Open"]);
  assert.deepEqual(find(events, f({ q: "quads boston" })), ["Saturday Quads"]);
  assert.deepEqual(find(events, f({ q: "massachusetts k-12" })), ["K-12 Championship"]);
});

test("sorting keeps unknown values and running series at the end", () => {
  const events = [
    event({ id: "a", name: "Alpha", date: "2026-12-05", endDate: "2026-12-05", prizeFundUsd: 500 }),
    event({ id: "b", name: "Bravo", date: "2026-11-20", endDate: "2026-11-20", prizeFundUsd: 9000 }),
    event({ id: "c", name: "Charlie", date: "2026-11-25", endDate: "2026-11-25" }),
    event({ id: "d", name: "League", date: "2026-09-01", endDate: "2027-05-01", prizeFundUsd: 0 }),
  ];
  const rows = buildRows(events, null);
  assert.deepEqual(names(sortRows(rows, "date", false, TODAY)), ["Bravo", "Charlie", "Alpha", "League"]);
  assert.deepEqual(names(sortRows(rows, "date", true, TODAY)), ["Alpha", "Charlie", "Bravo", "League"]);
  assert.deepEqual(names(sortRows(rows, "prize", true, TODAY)).slice(0, 2), ["Bravo", "Alpha"]);
  assert.deepEqual(names(sortRows(rows, "prize", false, TODAY)).slice(0, 2), ["Alpha", "Bravo"]);
  const groups = groupRows(sortRows(rows, "date", false, TODAY), "date", TODAY);
  assert.deepEqual(
    groups.map((g) => [g.label, g.rows.length]),
    [["November 2026", 2], ["December 2026", 1], ["Ongoing series and leagues", 1]],
  );
});

test("the entry-fee hint is the first listed price, marked when others follow", () => {
  assert.deepEqual(feeHint(event({ entryFeeText: "$165 by December 1\n$175 after December 1" })), {
    amount: "$165",
    varies: true,
  });
  assert.deepEqual(feeHint(event({ entryFeeText: "$25\nPrize\n$250 first" })), { amount: "$25", varies: false });
  assert.deepEqual(feeHint(event({ entryFeeText: "Free for members" })), { amount: "Free", varies: false });
  assert.equal(feeHint(event({ entryFeeText: "Due on registration" })), null);
  assert.equal(feeHint(event()), null);
});

test("wording", () => {
  assert.equal(relativeDay(TODAY, TODAY), "Today");
  assert.equal(relativeDay("2026-11-11", TODAY), "Tomorrow");
  assert.equal(relativeDay("2026-11-14", TODAY), "in 4 days");
  assert.equal(relativeDay("2026-12-25", TODAY), "");
  assert.equal(whereText(f({ near: BOSTON, radius: 100 })), "within 100 mi of Boston, MA");
  assert.equal(whereText(f({ state: "TX" })), "in Texas");
});

test("filters survive a round trip through the URL", () => {
  const filters = f({
    q: "open",
    near: { lat: 42.36, lng: -71.06, label: "Boston, MA" },
    radius: 50,
    when: "custom",
    from: "2026-12-01",
    to: "2026-12-31",
    formats: ["classical", "blitz"],
    lengths: ["multi"],
    fide: true,
    audience: "open",
    prize: 5000,
  });
  assert.deepEqual(tFiltersFromParams(tFiltersToParams(filters)), filters);
  assert.equal(tFiltersToParams(defaultTFilters).toString(), "");
  // A state link from the by-state pages; nonsense is ignored.
  assert.equal(tFiltersFromParams(new URLSearchParams("state=tx")).state, "TX");
  assert.deepEqual(tFiltersFromParams(new URLSearchParams("state=zz&prize=7&when=never&near=x,y")), defaultTFilters);
});
