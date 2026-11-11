import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterEvents,
  emptyFilters,
  sortEvents,
  hasCoordinates,
  withinBounds,
} from "../lib/events.ts";
const base = {
  id: "a",
  name: "Boston Open",
  date: "2026-10-03",
  type: "tournament",
  state: "MA",
  city: "Boston",
  rated: true,
  ratingSystem: "USCF",
  lat: 42.3,
  lng: -71,
  source: "uscf",
};
test("date ranges include ongoing multiday events and exclude expired events", () => {
  const events = [
    base,
    { ...base, id: "ongoing", date: "2026-09-30", endDate: "2026-10-04" },
    { ...base, id: "old", date: "2026-09-01" },
  ];
  assert.deepEqual(
    filterEvents(
      events,
      { ...emptyFilters, from: "2026-10-02", to: "2026-10-03" },
      "2026-10-02",
    ).map((e) => e.id),
    ["a", "ongoing"],
  );
});
test("unknown rating is not treated as unrated", () =>
  assert.equal(
    filterEvents(
      [{ ...base, rated: undefined }],
      { ...emptyFilters, rating: "unrated" },
      "2026-10-02",
    ).length,
    0,
  ));
test("online events are excluded from default results and physical map", () => {
  const online = { ...base, online: true };
  assert.equal(filterEvents([online], emptyFilters, "2026-10-02").length, 0);
  assert.equal(
    filterEvents([online], { ...emptyFilters, mode: "online" }, "2026-10-02")
      .length,
    1,
  );
  assert.equal(hasCoordinates(online), false);
});
test("unmapped events remain searchable until map-area filter is enabled", () => {
  const unmapped = { ...base, lat: undefined, lng: undefined };
  assert.equal(filterEvents([unmapped], emptyFilters, "2026-10-02").length, 1);
  assert.equal(
    filterEvents([unmapped], emptyFilters, "2026-10-02", {
      west: -73,
      east: -70,
      south: 40,
      north: 43,
    }).length,
    0,
  );
});
test("search state source and FIDE filters compose", () => {
  const e = { ...base, fideRated: true, sources: [{ id: "boylston" }] };
  assert.equal(
    filterEvents(
      [e],
      {
        ...emptyFilters,
        q: "Boston Open",
        state: "MA",
        source: "boylston",
        rating: "FIDE",
      },
      "2026-10-02",
    ).length,
    1,
  );
  assert.equal(
    filterEvents([e], { ...emptyFilters, state: "NY" }, "2026-10-02").length,
    0,
  );
});
test("prizes sort numerically with missing values last in both directions", () => {
  const events = [
    { ...base, id: "unknown" },
    { ...base, id: "small", prizeFundUsd: 20 },
    { ...base, id: "large", prizeFundUsd: 1000 },
  ];
  assert.deepEqual(
    sortEvents(events, "prize").map((e) => e.id),
    ["large", "small", "unknown"],
  );
  assert.deepEqual(
    sortEvents(events, "prize", true).map((e) => e.id),
    ["small", "large", "unknown"],
  );
});
test("dateline crossing bounds work and invalid coordinates are excluded", () => {
  assert.equal(
    withinBounds(
      { ...base, lng: -175 },
      { west: 170, east: -170, south: 40, north: 45 },
    ),
    true,
  );
  assert.equal(hasCoordinates({ ...base, lat: NaN }), false);
});

test("mixed schedules remain discoverable under each listed control", () => {
  const mixed = { ...base, format: "custom", timeControls: [
    { kind: "classical", baseMinutes: 110 },
    { kind: "rapid", baseMinutes: 30 },
  ] };
  for (const format of ["classical", "rapid", "custom"])
    assert.equal(filterEvents([mixed], { ...emptyFilters, format }, "2026-10-03").length, 1);
  assert.equal(filterEvents([mixed], { ...emptyFilters, format: "blitz" }, "2026-10-03").length, 0);
});

test("explicit cancellations never appear in search", () => {
  assert.equal(filterEvents([{ ...base, cancellationEvidence: "This tournament is cancelled." }], emptyFilters, "2026-10-03").length, 0);
});
