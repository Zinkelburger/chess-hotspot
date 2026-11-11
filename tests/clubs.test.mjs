import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildClubRows,
  cFiltersFromParams,
  cFiltersToParams,
  clubCityState,
  defaultCFilters,
  filterClubs,
  groupClubs,
} from "../lib/clubs.ts";

// 2026-11-10 is a Tuesday.
const TODAY = "2026-11-10";
const BOSTON = { lat: 42.36, lng: -71.06, label: "Boston, MA" };
const f = (patch = {}) => ({ ...defaultCFilters, ...patch });
const clubs = [
  { id: "b", name: "Boylston Chess Club", lat: 42.353, lng: -71.058, category: "club", address: "35 Kingston St STE 1, Boston, MA 02111", hours: { Tuesday: { open: "19:00" }, Saturday: { open: "10:00", close: "18:00" } } },
  { id: "w", name: "Worcester Chess Club", lat: 42.2626, lng: -71.8023, category: "club", city: "Worcester", state: "MA", hours: { Thursday: { open: "18:30" } } },
  { id: "c", name: "Chicago Chess Center", lat: 41.88, lng: -87.63, category: "club", city: "Chicago", state: "IL", hours: { Tuesday: { open: "17:00" } } },
  { id: "n", name: "Albany Knights", lat: 42.65, lng: -73.75, category: "club", address: "1 Main St, Albany, NY 12207" },
];
const ids = (rows) => rows.map((row) => row.spot.id);
const run = (filters) => filterClubs(buildClubRows(clubs, filters.near), filters, TODAY);

test("city and state come from the address when the record has none", () => {
  assert.deepEqual(clubCityState(clubs[0]), { city: "Boston", state: "MA" });
  assert.deepEqual(clubCityState(clubs[1]), { city: "Worcester", state: "MA" });
  assert.deepEqual(clubCityState({ ...clubs[0], address: "Parque del Retiro, 28009 Madrid, Spain" }), { city: "", state: "" });
  assert.deepEqual(clubCityState({ ...clubs[0], address: "16 E Bacon St, Plainville, MA" }), { city: "Plainville", state: "MA" });
  assert.deepEqual(clubCityState({ ...clubs[0], address: "11555 National Blvd Los Angeles CA 90064" }), { city: "", state: "CA" });
});

test("place, day and search filters", () => {
  assert.deepEqual(ids(run(f({ near: BOSTON, radius: 25 }))), ["b"]);
  assert.deepEqual(ids(run(f({ near: BOSTON, radius: 50 }))), ["b", "w"]);
  assert.equal(run(f({ near: BOSTON, radius: 0 })).length, 4);
  assert.deepEqual(ids(run(f({ state: "MA" }))), ["b", "w"]);
  assert.deepEqual(ids(run(f({ days: ["Thursday"] }))), ["w"]);
  // Today is a Tuesday; a club with no known day is not promised for it.
  assert.deepEqual(ids(run(f({ when: "today" }))), ["b", "c"]);
  assert.deepEqual(ids(run(f({ when: "weekend" }))), ["b"]);
  assert.deepEqual(ids(run(f({ q: "new york" }))), ["n"]);
});

test("sections: by state, by distance, and the week day by day", () => {
  const all = run(f());
  assert.deepEqual(
    groupClubs(all, "place", f(), TODAY).map((g) => [g.label, g.entries.length]),
    [["Illinois", 1], ["Massachusetts", 2], ["New York", 1]],
  );
  const near = run(f({ near: BOSTON, radius: 0 }));
  assert.deepEqual(groupClubs(near, "distance", f(), TODAY)[0].entries.map((e) => e.row.spot.id), ["b", "w", "n", "c"]);
  const week = groupClubs(all, "week", f(), TODAY);
  assert.deepEqual(
    week.map((g) => [g.label, g.entries.map((e) => e.row.spot.id)]),
    [
      ["Today · Tue, Nov 10", ["c", "b"]],
      ["Thu, Nov 12", ["w"]],
      ["Sat, Nov 14", ["b"]],
      ["Ask for meeting times", ["n"]],
    ],
  );
  assert.equal(week[0].entries[0].day, "Tuesday");
});

test("filters survive a round trip through the URL", () => {
  const filters = f({ q: "knights", near: BOSTON, radius: 100, days: ["Tuesday", "Saturday"], when: "weekend" });
  assert.deepEqual(cFiltersFromParams(cFiltersToParams(filters)), filters);
  assert.equal(cFiltersToParams(defaultCFilters).toString(), "");
  assert.equal(cFiltersFromParams(new URLSearchParams("state=ma")).state, "MA");
});
