// The club finder: which clubs pass its filters, how the list is ordered and
// sectioned, and how the filters are written into the URL. Pure functions, so
// `node --test` can load this file as is.
import type { DayOfWeek, SpotRaw } from "../types/spot";
import {
  DAYS,
  addDays,
  clubDays,
  clubMatches,
  defaultFilters,
  shortDate,
  weekdayOf,
  weekendRange,
} from "./explore.ts";
import { RADII, milesBetween, type Near } from "./tournaments.ts";
import { STATES } from "./us-states.ts";

export type CWhen = "any" | "today" | "weekend";
/** By state, by distance, by name, or the coming week day by day. */
export type CSort = "place" | "distance" | "name" | "week";

export type CFilters = {
  q: string;
  near: Near | null;
  /** Miles from `near`; 0 measures and sorts without a cut-off. */
  radius: number;
  state: string;
  /** Empty means any day of the week. */
  days: DayOfWeek[];
  when: CWhen;
};

export const defaultCFilters: CFilters = {
  q: "",
  near: null,
  radius: 50,
  state: "",
  days: [],
  when: "any",
};

// ─── Rows ───

export type CRow = {
  spot: SpotRaw;
  city: string;
  state: string;
  /** Lower-cased text the search box looks in. */
  text: string;
  days: DayOfWeek[];
  miles: number | null;
};

/** Half the records carry no city or state of their own; the address does. */
export function clubCityState(spot: SpotRaw): { city: string; state: string } {
  if (spot.city && spot.state) return { city: spot.city, state: spot.state };
  const match = (spot.address || "").match(
    /,\s*([^,]+),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*(?:USA|United States))?\s*$/,
  );
  // "11555 National Blvd Los Angeles CA 90064": no commas to find the town by,
  // but the state is still the two letters before the ZIP code.
  const loose = (spot.address || "").match(/\b([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  const code = match?.[2] ?? loose?.[1] ?? "";
  return {
    city: spot.city || (match ? match[1].trim() : ""),
    state: spot.state || (STATES[code] ? code : ""),
  };
}

export function buildClubRows(spots: SpotRaw[], near: Near | null): CRow[] {
  return spots.map((spot) => {
    const { city, state } = clubCityState(spot);
    return {
      spot,
      city,
      state,
      text: [spot.name, spot.address, city, state, state ? STATES[state] : "", spot.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      days: clubDays(spot),
      miles:
        near && spot.lat != null && spot.lng != null
          ? milesBetween(near, { lat: spot.lat, lng: spot.lng })
          : null,
    };
  });
}

// ─── Filtering ───

export function filterClubs(rows: CRow[], f: CFilters, today: string): CRow[] {
  const tokens = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const schedule = { ...defaultFilters, days: f.days, when: f.when };
  return rows.filter((row) => {
    if (f.state && row.state !== f.state) return false;
    if (f.near && f.radius > 0 && (row.miles == null || row.miles > f.radius)) return false;
    // A club with no known meeting day cannot be promised for a particular day.
    if (!clubMatches(row.spot, schedule, today)) return false;
    return tokens.every((token) => row.text.includes(token));
  });
}

export function activeClubFilterCount(f: CFilters): number {
  return f.days.length + Number(f.when !== "any") + Number(f.state !== "");
}

// ─── Sorting and grouping ───

/** A club in a list, and the day it is listed under in the week view. */
export type CEntry = { key: string; row: CRow; day: DayOfWeek | null };
export type CGroup = { key: string; label: string; entries: CEntry[] };

const byName = (a: CRow, b: CRow) => a.spot.name.localeCompare(b.spot.name);
const plain = (rows: CRow[]): CEntry[] => rows.map((row) => ({ key: row.spot.id, row, day: null }));

/**
 * Sections for the list. "week" writes the next seven days out date by date,
 * a club appearing on each day it meets, the way a weekly night shows up on a
 * listings page; clubs with no known day close it.
 */
export function groupClubs(rows: CRow[], sort: CSort, f: CFilters, today: string): CGroup[] {
  if (sort === "distance" || sort === "name") {
    const sorted = [...rows].sort(
      sort === "name"
        ? byName
        : (a, b) =>
            a.miles == null || b.miles == null
              ? Number(a.miles == null) - Number(b.miles == null) || byName(a, b)
              : a.miles - b.miles,
    );
    return sorted.length ? [{ key: "all", label: "", entries: plain(sorted) }] : [];
  }

  if (sort === "place") {
    const byState = new Map<string, CRow[]>();
    for (const row of rows) {
      const label = STATES[row.state] || "Elsewhere";
      byState.set(label, [...(byState.get(label) ?? []), row]);
    }
    return [...byState.entries()]
      .sort(([a], [b]) => Number(a === "Elsewhere") - Number(b === "Elsewhere") || a.localeCompare(b))
      .map(([label, group]) => ({
        key: label,
        label,
        entries: plain(group.sort((a, b) => a.city.localeCompare(b.city) || byName(a, b))),
      }));
  }

  const groups: CGroup[] = [];
  const window =
    f.when === "today"
      ? { from: today, to: today }
      : f.when === "weekend"
        ? weekendRange(today)
        : { from: today, to: addDays(today, 6) };
  for (let date = window.from; date <= window.to; date = addDays(date, 1)) {
    const day = weekdayOf(date);
    if (f.days.length && !f.days.includes(day)) continue;
    const meeting = rows
      .filter((row) => row.spot.hours?.[day] != null)
      .sort(
        (a, b) =>
          (a.spot.hours?.[day]?.open || "99").localeCompare(b.spot.hours?.[day]?.open || "99") ||
          byName(a, b),
      );
    if (!meeting.length) continue;
    const lead = date === today ? "Today · " : date === addDays(today, 1) ? "Tomorrow · " : "";
    groups.push({
      key: date,
      label: lead + shortDate(date, today),
      entries: meeting.map((row) => ({ key: `${row.spot.id}:${date}`, row, day })),
    });
  }
  const undated = rows.filter((row) => !row.days.length).sort(byName);
  if (undated.length)
    groups.push({ key: "undated", label: "Ask for meeting times", entries: plain(undated) });
  return groups;
}

// ─── URL ───

const DAY_CODES = DAYS.map((day) => day.slice(0, 3).toLowerCase());

export function cFiltersToParams(f: CFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.near) {
    params.set("near", `${f.near.lat.toFixed(3)},${f.near.lng.toFixed(3)}`);
    params.set("place", f.near.label);
    if (f.radius !== defaultCFilters.radius) params.set("within", String(f.radius));
  }
  if (f.state) params.set("state", f.state);
  if (f.days.length)
    params.set("day", f.days.map((day) => DAY_CODES[DAYS.indexOf(day)]).join(","));
  if (f.when !== "any") params.set("when", f.when);
  return params;
}

export function cFiltersFromParams(params: URLSearchParams): CFilters {
  const list = (key: string) => (params.get(key) || "").split(",").filter(Boolean);
  const [lat, lng] = (params.get("near") || "").split(",").map(Number);
  const hasNear =
    params.has("near") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90;
  const within = Number(params.get("within"));
  const state = (params.get("state") || "").toUpperCase();
  const when = params.get("when");
  return {
    q: params.get("q") || "",
    near: hasNear ? { lat, lng, label: params.get("place") || "your place" } : null,
    radius: params.has("within") && RADII.includes(within) ? within : defaultCFilters.radius,
    state: !hasNear && STATES[state] ? state : "",
    days: DAYS.filter((_, i) => list("day").includes(DAY_CODES[i])),
    when: when === "today" || when === "weekend" ? when : "any",
  };
}
