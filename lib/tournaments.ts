// The tournament finder: which listings pass its filters, how they are
// ordered, and how the filters are written into the URL. Pure functions, so
// `node --test` can load this file as is.
import type { ChessEvent } from "../types/event";
import {
  FORMATS,
  addDays,
  daysBetween,
  displayName,
  eventFormats,
  hasPin,
  weekendRange,
  type Format,
} from "./explore.ts";
import { STATES } from "./us-states.ts";

export type TWhen = "any" | "weekend" | "30d" | "90d" | "custom";
/** One day, a weekend-to-a-week event, or something that runs for weeks. */
export type TLength = "day" | "multi" | "series";
export type TSort = "date" | "name" | "place" | "distance" | "prize";
export type Near = { lat: number; lng: number; label: string };

export type TFilters = {
  q: string;
  /** Where the visitor is looking from. Distances are measured from here. */
  near: Near | null;
  /** Miles from `near`; 0 measures and sorts by distance without a cut-off. */
  radius: number;
  /** Two-letter state code; used instead of `near`, never with it. */
  state: string;
  when: TWhen;
  /** ISO dates, used only when `when` is "custom". */
  from: string;
  to: string;
  formats: Format[];
  lengths: TLength[];
  fide: boolean;
  audience: "" | "open" | "scholastic";
  /** Smallest prize fund in dollars; 0 means any, including unlisted. */
  prize: number;
  mode: "" | "in-person" | "online";
};

export const defaultTFilters: TFilters = {
  q: "",
  near: null,
  radius: 100,
  state: "",
  when: "any",
  from: "",
  to: "",
  formats: [],
  lengths: [],
  fide: false,
  audience: "",
  prize: 0,
  mode: "",
};

export const RADII = [25, 50, 100, 250, 0];
export const PRIZES = [1000, 5000, 10000];
export const LENGTHS: TLength[] = ["day", "multi", "series"];
export const LENGTH_LABELS: Record<TLength, string> = {
  day: "One day",
  multi: "Multi-day",
  series: "Weekly series",
};
/** The longest run of days that is still one event rather than a series. */
const MULTI_DAY_MAX = 9;

// ─── Rows ───

/** A tournament with everything the filters and the table read worked out once. */
export type TRow = {
  event: ChessEvent;
  name: string;
  /** Lower-cased text the search box looks in. */
  text: string;
  formats: Format[];
  length: TLength;
  /** Prize fund in dollars, or null when the organizer does not state one. */
  prize: number | null;
  /** Miles from the visitor's place, or null when either end is unknown. */
  miles: number | null;
};

export function eventLength(event: ChessEvent): TLength {
  const span = daysBetween(event.date, event.endDate || event.date);
  return span <= 0 ? "day" : span <= MULTI_DAY_MAX ? "multi" : "series";
}

/** Great-circle distance in miles. */
export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function buildRows(events: ChessEvent[], near: Near | null): TRow[] {
  return events.map((event) => {
    const prize = event.prizeFundUsd ?? event.prizeFundGuaranteedUsd;
    return {
      event,
      name: displayName(event.name),
      text: [
        event.name,
        event.city,
        event.state,
        event.state ? STATES[event.state] : "",
        event.venue,
        event.organizer,
        event.address,
        event.timeControl?.raw,
        ...(event.sections || []).map((section) => section.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      formats: eventFormats(event),
      length: eventLength(event),
      // A stated fund of $0 says "no cash prizes", which is not a prize fund.
      prize: prize ? prize : null,
      miles: near && hasPin(event) ? milesBetween(near, event) : null,
    };
  });
}

// ─── Filtering ───

/** The dates the filters ask for. `to` is null when the window is open-ended. */
export function tDateWindow(
  f: TFilters,
  today: string,
): { from: string; to: string | null } {
  if (f.when === "weekend") return weekendRange(today);
  if (f.when === "30d") return { from: today, to: addDays(today, 29) };
  if (f.when === "90d") return { from: today, to: addDays(today, 89) };
  if (f.when === "custom" && (f.from || f.to))
    return { from: f.from && f.from > today ? f.from : today, to: f.to || null };
  return { from: today, to: null };
}

export function rowMatches(
  row: TRow,
  f: TFilters,
  today: string,
  tokens: string[],
): boolean {
  const { event } = row;
  const { from, to } = tDateWindow(f, today);
  if ((event.endDate || event.date) < from || (to != null && event.date > to)) return false;
  if (f.mode === "online" && !event.online) return false;
  if (f.mode === "in-person" && event.online) return false;
  if (f.state && (event.online || event.state !== f.state)) return false;
  // A distance cannot be promised for an event with no place on the map.
  if (f.near && f.radius > 0 && (row.miles == null || row.miles > f.radius)) return false;
  if (f.formats.length && !f.formats.some((format) => row.formats.includes(format))) return false;
  if (f.lengths.length && !f.lengths.includes(row.length)) return false;
  if (f.fide && !(event.fideRated || event.ratingSystem === "FIDE")) return false;
  if (f.audience === "scholastic" && event.audience !== "scholastic") return false;
  if (f.audience === "open" && event.audience === "scholastic") return false;
  if (f.prize > 0 && (row.prize ?? 0) < f.prize) return false;
  return tokens.every((token) => row.text.includes(token));
}

export function filterRows(rows: TRow[], f: TFilters, today: string): TRow[] {
  const tokens = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => rowMatches(row, f, today, tokens));
}

/** How many filters are narrowing the list, for the "Filters · 3" button. */
export function activeFilterCount(f: TFilters): number {
  return (
    Number(f.when !== "any") +
    f.formats.length +
    f.lengths.length +
    Number(f.fide) +
    Number(f.audience !== "") +
    Number(f.prize > 0) +
    Number(f.mode !== "") +
    Number(f.state !== "")
  );
}

// ─── Sorting and grouping ───

/** A series that began before today: still on, but not news. */
const isRunningSeries = (row: TRow, today: string) =>
  row.length === "series" && row.event.date < today;

/** The direction a column sorts in when first chosen. */
export const defaultDescending = (sort: TSort) => sort === "prize";

export function sortRows(rows: TRow[], sort: TSort, descending: boolean, today: string): TRow[] {
  const flip = descending ? -1 : 1;
  const byDate = (a: TRow, b: TRow) =>
    a.event.date.localeCompare(b.event.date) || a.name.localeCompare(b.name);
  /** Unknown values close the list whichever way it is sorted. */
  const numeric = (a: number | null, b: number | null) =>
    a == null || b == null ? Number(a == null) - Number(b == null) : flip * (a - b);
  return [...rows].sort((a, b) => {
    if (sort === "date")
      return (
        Number(isRunningSeries(a, today)) - Number(isRunningSeries(b, today)) ||
        flip * a.event.date.localeCompare(b.event.date) ||
        a.name.localeCompare(b.name)
      );
    if (sort === "name") return flip * a.name.localeCompare(b.name) || byDate(a, b);
    if (sort === "place")
      return (
        Number(!!a.event.online) - Number(!!b.event.online) ||
        flip *
          `${a.event.state || "~"} ${a.event.city || ""}`.localeCompare(
            `${b.event.state || "~"} ${b.event.city || ""}`,
          ) ||
        byDate(a, b)
      );
    if (sort === "distance") return numeric(a.miles, b.miles) || byDate(a, b);
    return numeric(a.prize, b.prize) || byDate(a, b);
  });
}

export type TGroup = { key: string; label: string; rows: TRow[] };

const monthLabel = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Headings for a sorted list: months when it is in date order, states when it
 * is in place order, and one unlabelled group otherwise.
 */
export function groupRows(rows: TRow[], sort: TSort, today: string): TGroup[] {
  const groups: TGroup[] = [];
  const add = (key: string, label: string, row: TRow) => {
    const last = groups[groups.length - 1];
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, label, rows: [row] });
  };
  for (const row of rows) {
    const { event } = row;
    if (sort === "date") {
      if (isRunningSeries(row, today)) add("series", "Ongoing series and leagues", row);
      else if (event.date < today) add("now", "Under way", row);
      else add(event.date.slice(0, 7), monthLabel(event.date), row);
    } else if (sort === "place") {
      if (event.online) add("online", "Online", row);
      else add(event.state || "?", (event.state && STATES[event.state]) || "Elsewhere", row);
    } else add("all", "", row);
  }
  return groups;
}

// ─── Wording ───

/** "Today", "Tomorrow", "in 5 days" for the next two weeks; "" beyond that. */
export function relativeDay(iso: string, today: string): string {
  const days = daysBetween(today, iso);
  if (days < 0 || days > 14) return "";
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`;
}

export const formatMiles = (miles: number) =>
  miles < 10 ? `${Math.max(1, Math.round(miles))} mi` : `${Math.round(miles / 5) * 5} mi`;

/**
 * The first price in the organizer's entry-fee text, for a table cell. Fees
 * usually vary by section and date, so this is a hint, never a quote: `varies`
 * says other prices follow, and the full text stays one click away.
 */
export function feeHint(event: ChessEvent): { amount: string; varies: boolean } | null {
  const text = event.entryFeeText;
  if (!text) {
    if (event.entryFeeUsdMin == null) return null;
    return {
      amount: event.entryFeeUsdMin === 0 ? "Free" : `$${event.entryFeeUsdMin}`,
      varies: event.entryFeeUsdMax != null && event.entryFeeUsdMax !== event.entryFeeUsdMin,
    };
  }
  if (/^\s*free\b/i.test(text)) return { amount: "Free", varies: false };
  // Prize lists often follow the fees in the same block of text.
  const head = text.split(/\bprizes?\b/i)[0].slice(0, 240);
  const amounts = [...head.matchAll(/\$\s?(\d{1,3}(?:,\d{3})|\d{1,4})(?:\.\d{2})?/g)].map((m) =>
    Number(m[1].replace(",", "")),
  );
  if (!amounts.length) return null;
  return { amount: `$${amounts[0]}`, varies: new Set(amounts).size > 1 };
}

/** "within 100 mi of Boston, MA", "in Texas", or "" for the whole country. */
export function whereText(f: TFilters): string {
  if (f.near)
    return f.radius > 0 ? `within ${f.radius} mi of ${f.near.label}` : `nearest ${f.near.label}`;
  if (f.state) return `in ${STATES[f.state] || f.state}`;
  return "";
}

// ─── URL ───

const isIsoDate = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function tFiltersToParams(f: TFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.near) {
    params.set("near", `${f.near.lat.toFixed(3)},${f.near.lng.toFixed(3)}`);
    params.set("place", f.near.label);
    if (f.radius !== defaultTFilters.radius) params.set("within", String(f.radius));
  }
  if (f.state) params.set("state", f.state);
  if (f.when === "custom") {
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
  } else if (f.when !== "any") params.set("when", f.when);
  if (f.formats.length) params.set("play", f.formats.join(","));
  if (f.lengths.length) params.set("length", f.lengths.join(","));
  if (f.fide) params.set("fide", "1");
  if (f.audience) params.set("for", f.audience);
  if (f.prize > 0) params.set("prize", String(f.prize));
  if (f.mode) params.set("mode", f.mode);
  return params;
}

export function tFiltersFromParams(params: URLSearchParams): TFilters {
  const list = (key: string) => (params.get(key) || "").split(",").filter(Boolean);
  const [lat, lng] = (params.get("near") || "").split(",").map(Number);
  const hasNear =
    params.has("near") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90;
  const within = Number(params.get("within"));
  const from = params.get("from");
  const to = params.get("to");
  const custom = isIsoDate(from) || isIsoDate(to);
  const when = params.get("when");
  const state = (params.get("state") || "").toUpperCase();
  const audience = params.get("for");
  const mode = params.get("mode");
  const prize = Number(params.get("prize"));
  return {
    q: params.get("q") || "",
    near: hasNear ? { lat, lng, label: params.get("place") || "your place" } : null,
    radius: params.has("within") && RADII.includes(within) ? within : defaultTFilters.radius,
    state: !hasNear && STATES[state] ? state : "",
    when: custom ? "custom" : when === "weekend" || when === "30d" || when === "90d" ? when : "any",
    from: custom && isIsoDate(from) ? from : "",
    to: custom && isIsoDate(to) ? to : "",
    formats: FORMATS.filter((format) => list("play").includes(format)),
    lengths: LENGTHS.filter((length) => list("length").includes(length)),
    fide: params.get("fide") === "1",
    audience: audience === "open" || audience === "scholastic" ? audience : "",
    prize: PRIZES.includes(prize) ? prize : 0,
    mode: mode === "online" || mode === "in-person" ? mode : "",
  };
}
