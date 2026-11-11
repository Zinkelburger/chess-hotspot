import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLearnRows,
  defaultLFilters,
  filterLearn,
  groupLearn,
  lFiltersFromParams,
  lFiltersToParams,
  learnPlace,
} from "../lib/learn.ts";

const BOSTON = { lat: 42.36, lng: -71.06, label: "Boston, MA" };
const f = (patch = {}) => ({ ...defaultLFilters, ...patch });
const listings = [
  { id: "c1", kind: "coach", name: "Ana Reyes", title: "IM", fideRating: 2400, city: "Boston", state: "MA", lat: 42.36, lng: -71.06, offers: ["lessons"], online: true, languages: ["Español"], source: "lichess" },
  { id: "c2", kind: "coach", name: "Bo Chen", title: "GM", fideRating: 2550, state: "CA", offers: ["lessons"], online: true, source: "lichess" },
  { id: "c3", kind: "coach", name: "Cy Dole", offers: ["lessons"], online: true, place: "Alicante", source: "lichess" },
  { id: "a1", kind: "academy", name: "KNIGHT SCHOOL OF CHESS", city: "Worcester", state: "MA", lat: 42.2626, lng: -71.8023, offers: ["classes", "camps"], beginners: true, kids: true, source: "uscf" },
  { id: "k1", kind: "club", name: "Elm Street Chess Club", city: "Chicago", state: "IL", lat: 41.88, lng: -87.63, offers: ["lessons"], source: "uscf" },
];
const ids = (rows) => rows.map((row) => row.listing.id);
const run = (filters) => filterLearn(buildLearnRows(listings, filters.near), filters);

test("with no place chosen everything is local", () => {
  const { local, online } = run(f());
  assert.equal(local.length, 5);
  assert.equal(online.length, 0);
});

test("a place lists what is near, then the coaches who teach online from elsewhere", () => {
  const { local, online } = run(f({ near: BOSTON, radius: 50 }));
  assert.deepEqual(ids(local), ["c1", "a1"]);
  assert.deepEqual(ids(online), ["c2", "c3"]);
  const byState = run(f({ state: "IL" }));
  assert.deepEqual(ids(byState.local), ["k1"]);
  assert.deepEqual(ids(byState.online), ["c1", "c2", "c3"]);
});

test("filters by kind, offer, title, audience and search text", () => {
  assert.deepEqual(ids(run(f({ kinds: ["academy", "club"] })).local), ["a1", "k1"]);
  assert.deepEqual(ids(run(f({ offers: ["camps"] })).local), ["a1"]);
  assert.deepEqual(ids(run(f({ titled: true })).local), ["c1", "c2"]);
  assert.deepEqual(ids(run(f({ kids: true })).local), ["a1"]);
  assert.deepEqual(ids(run(f({ q: "español" })).local), ["c1"]);
  assert.deepEqual(ids(run(f({ q: "massachusetts" })).local), ["c1", "a1"]);
  // A place filter never brings back a coach the other filters ruled out.
  assert.deepEqual(ids(run(f({ near: BOSTON, radius: 25, kinds: ["academy"] })).online), []);
});

test("sections: coaches strongest first, places by state, online coaches last", () => {
  const { local, online } = run(f());
  const groups = groupLearn(local, online, "type");
  assert.deepEqual(groups.map((g) => g.label), ["Coaches", "Schools & academies", "Clubs that teach"]);
  assert.deepEqual(ids(groups[0].rows), ["c2", "c1", "c3"]);
  const near = run(f({ near: BOSTON, radius: 50 }));
  const byDistance = groupLearn(near.local, near.online, "distance");
  assert.deepEqual(ids(byDistance[0].rows), ["c1", "a1"]);
  assert.equal(byDistance[1].label, "Coaches who teach online, from anywhere");
});

test("names and places are worded for people", () => {
  assert.equal(buildLearnRows(listings, null)[3].name, "Knight School of Chess");
  assert.equal(learnPlace(listings[0]), "Boston, MA");
  assert.equal(learnPlace(listings[1]), "California");
  assert.equal(learnPlace(listings[2]), "Alicante");
});

test("filters survive a round trip through the URL", () => {
  const filters = f({ q: "camp", near: BOSTON, radius: 100, kinds: ["coach"], offers: ["lessons"], titled: true, kids: true });
  assert.deepEqual(lFiltersFromParams(lFiltersToParams(filters)), filters);
  assert.equal(lFiltersToParams(defaultLFilters).toString(), "");
});
