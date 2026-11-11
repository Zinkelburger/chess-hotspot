// Everything the map, the feed and the search box agree on: what counts as a
// listing, which listings pass the filters, and how they are worded. Pure
// functions with type-only imports so `node --test` can load this file as is.
import type { ChessEvent } from "../types/event";
import type { DayOfWeek, SpotRaw } from "../types/spot";

export type Kind = "club" | "tournament";
export type Format = "classical" | "rapid" | "blitz";
export type When = "any" | "today" | "weekend" | "custom";

export type Filters = {
  /** Empty means every kind. */
  kinds: Kind[];
  /** Empty means any time control. Choosing one hides clubs. */
  formats: Format[];
  /** Empty means any day of the week. */
  days: DayOfWeek[];
  when: When;
  /** ISO dates, used only when `when` is "custom". */
  from: string;
  to: string;
  /** Only tournaments with a prize fund of BIG_PRIZE_USD or more. */
  big: boolean;
};

export const defaultFilters: Filters = {
  kinds: [],
  formats: [],
  days: [],
  when: "any",
  from: "",
  to: "",
  big: false,
};

export type Item =
  | { kind: "club"; id: string; spot: SpotRaw }
  | { kind: "tournament"; id: string; event: ChessEvent };

export const KINDS: Kind[] = ["club", "tournament"];
export const FORMATS: Format[] = ["classical", "rapid", "blitz"];
export const DAYS: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const DAY_SHORT: Record<DayOfWeek, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};
export const KIND_LABELS: Record<Kind, string> = {
  club: "Clubs",
  tournament: "Tournaments",
};
export const FORMAT_LABELS: Record<Format, string> = {
  classical: "Classical",
  rapid: "Rapid",
  blitz: "Blitz",
};
/** Pin colours. The filter pills use the same hues, so the bar is the legend. */
export const KIND_COLORS: Record<Kind, string> = {
  club: "#10b981",
  tournament: "#3b82f6",
};
export const BIG_PRIZE_USD = 5000;

// ─── Dates ───

const WEEKDAYS: DayOfWeek[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Noon UTC keeps a calendar date on the same day in every timezone. */
const utcNoon = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(iso: string, days: number): string {
  const date = utcNoon(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekdayOf(iso: string): DayOfWeek {
  return WEEKDAYS[utcNoon(iso).getUTCDay()];
}
export function daysBetween(from: string, to: string): number {
  return Math.round((utcNoon(to).getTime() - utcNoon(from).getTime()) / 86400000);
}

/** Friday to Sunday; on a Saturday or Sunday, what is left of this weekend. */
export function weekendRange(today: string): { from: string; to: string } {
  const day = utcNoon(today).getUTCDay();
  const from = day === 0 ? today : addDays(today, Math.max(0, 5 - day));
  const fromDay = utcNoon(from).getUTCDay();
  return { from, to: addDays(from, (7 - fromDay) % 7) };
}

/** The dates the filters ask for. `to` is null when the window is open-ended. */
export function dateWindow(
  f: Filters,
  today: string,
): { from: string; to: string | null } {
  if (f.when === "today") return { from: today, to: today };
  if (f.when === "weekend") return weekendRange(today);
  if (f.when === "custom" && (f.from || f.to))
    return {
      from: f.from && f.from > today ? f.from : today,
      to: f.to || null,
    };
  return { from: today, to: null };
}

/** Weekdays inside a window, or null when it spans a whole week or more. */
function weekdaysIn(from: string, to: string | null): Set<DayOfWeek> | null {
  if (to == null) return null;
  const span = daysBetween(from, to);
  if (span >= 6) return null;
  const days = new Set<DayOfWeek>();
  for (let i = 0; i <= span; i++) days.add(weekdayOf(addDays(from, i)));
  return days;
}

// ─── Clubs ───

/** Clubs worth a pin: they meet in person, were not weeded out, and are mapped. */
export function isListedClub(
  spot: SpotRaw,
): spot is SpotRaw & { lat: number; lng: number } {
  return (
    spot.has_weekly_club_meetings !== false &&
    spot.skip !== true &&
    spot.lat != null &&
    spot.lng != null
  );
}

export function clubDays(spot: SpotRaw): DayOfWeek[] {
  return DAYS.filter((day) => spot.hours?.[day] != null);
}

export function clubMatches(spot: SpotRaw, f: Filters, today: string): boolean {
  if (f.kinds.length && !f.kinds.includes("club")) return false;
  // Time controls and prize funds describe tournaments, not club nights.
  if (f.formats.length || f.big) return false;
  const { from, to } = dateWindow(f, today);
  const inWindow = weekdaysIn(from, to);
  if (!f.days.length && !inWindow) return true;
  // A club with no known meeting day cannot be promised for a particular day.
  return clubDays(spot).some(
    (day) =>
      (!f.days.length || f.days.includes(day)) && (!inWindow || inWindow.has(day)),
  );
}

/** "19:00" → "7 PM", "18:30" → "6:30 PM". */
export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/** "7 PM – 9 PM", "from 7 PM", or "" when only the day is known. */
export function clubHoursOn(spot: SpotRaw, day: DayOfWeek): string {
  const hours = spot.hours?.[day];
  if (!hours?.open) return "";
  return hours.close
    ? `${formatClock(hours.open)} – ${formatClock(hours.close)}`
    : `from ${formatClock(hours.open)}`;
}

/** One line per meeting day: [{ day: "Tue", text: "from 7 PM" }, …]. */
export function clubSchedule(spot: SpotRaw): { day: DayOfWeek; text: string }[] {
  return clubDays(spot).map((day) => ({ day, text: clubHoursOn(spot, day) }));
}

export function clubWebsites(spot: SpotRaw): string[] {
  const urls = spot.website ? [spot.website].flat() : [];
  // A URL the verification pass found to belong to someone else is not shown.
  return urls.filter((url) => spot.website_confidence?.[url] !== "mismatch");
}

export function clubPlace(spot: SpotRaw): string {
  return spot.address || [spot.city, spot.state].filter(Boolean).join(", ");
}

// ─── Tournaments ───

/** Upcoming, not cancelled, and not an organizer's placeholder listing. */
export function isListedEvent(event: ChessEvent, today: string): boolean {
  if (event.cancellationEvidence) return false;
  if ((event.endDate || event.date) < today) return false;
  // Registration platforms publish "Sample – …" templates dated years ahead.
  if (/^sample\b/i.test(event.name.trim())) return false;
  return Number(event.date.slice(0, 4)) - Number(today.slice(0, 4)) <= 2;
}

export function hasPin(
  event: ChessEvent,
): event is ChessEvent & { lat: number; lng: number } {
  return (
    !event.online &&
    typeof event.lat === "number" &&
    typeof event.lng === "number" &&
    Number.isFinite(event.lat) &&
    Number.isFinite(event.lng) &&
    Math.abs(event.lat) <= 90 &&
    Math.abs(event.lng) <= 180
  );
}

export function isBigEvent(event: ChessEvent): boolean {
  return (
    (event.prizeFundUsd ?? event.prizeFundGuaranteedUsd ?? 0) >= BIG_PRIZE_USD
  );
}

/** Every speed a tournament offers, fastest-to-name first. */
export function eventFormats(event: ChessEvent): Format[] {
  const kinds = new Set<string>();
  const main = event.format || event.timeControl?.kind;
  if (main) kinds.add(main);
  for (const control of event.timeControls || []) kinds.add(control.kind);
  return FORMATS.filter((format) => kinds.has(format));
}

export function eventMatches(event: ChessEvent, f: Filters, today: string): boolean {
  if (f.kinds.length && !f.kinds.includes("tournament")) return false;
  if (f.big && !isBigEvent(event)) return false;
  if (f.formats.length) {
    const formats = eventFormats(event);
    if (!f.formats.some((format) => formats.includes(format))) return false;
  }
  const { from, to } = dateWindow(f, today);
  const end = event.endDate || event.date;
  if (end < from || (to != null && event.date > to)) return false;
  if (!f.days.length) return true;
  // The days this event is actually on inside the window.
  const first = event.date > from ? event.date : from;
  const last = to != null && to < end ? to : end;
  const played = weekdaysIn(first, last);
  return !played || f.days.some((day) => played.has(day));
}

/** "Sat, Nov 14"; the year is added once it is not this one. */
export function shortDate(iso: string, today: string, weekday = true): string {
  return utcNoon(iso).toLocaleDateString("en-US", {
    ...(weekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    ...(iso.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "Sat, Nov 14" or "Sat, Nov 14 – Sun, Nov 15". */
export function eventDateText(event: ChessEvent, today: string): string {
  const end = event.endDate || event.date;
  return end === event.date
    ? shortDate(event.date, today)
    : `${shortDate(event.date, today)} – ${shortDate(end, today)}`;
}

/** Listings write "Charlotte , NC 28262 United States"; say it the way people do. */
export function tidyAddress(address: string): string {
  return address
    .replace(/\s+,/g, ",")
    .replace(/[\s,]*\bUnited States\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function eventAddress(event: ChessEvent): string {
  return tidyAddress(event.address || [event.city, event.state].filter(Boolean).join(", "));
}

export function eventPlace(event: ChessEvent): string {
  if (event.online) return "Online";
  const area = [event.city, event.state].filter(Boolean).join(", ");
  return (
    [event.venue && event.venue !== event.city ? event.venue : "", area]
      .filter(Boolean)
      .join(" · ") ||
    event.address ||
    "Location to be confirmed"
  );
}

const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function eventFee(event: ChessEvent): string {
  if (event.entryFeeText) return event.entryFeeText;
  if (event.entryFeeUsdMin == null) return "";
  return event.entryFeeUsdMin === 0
    ? "Free entry"
    : `Entry from ${usd(event.entryFeeUsdMin)}`;
}

export function eventPrize(event: ChessEvent): string {
  const fund = event.prizeFundUsd ?? event.prizeFundGuaranteedUsd;
  if (!fund) return "";
  return `${usd(fund)} in prizes${event.prizeFundGuaranteedUsd != null ? ", guaranteed" : ""}`;
}

// ─── Names ───

const SMALL_WORDS = new Set(
  "a an and at by for in of on or the to vs with".split(" "),
);
/** Short words that are words, not initials. Anything else this short stays capitals. */
const SHORT_WORDS = new Set(
  "all old one two end ice inn art air sea sky st mt jr sr my no go up we is it be so do".split(
    " ",
  ),
);
const ACRONYMS = new Set("fide uscf usate ymca ymha nscf".split(" "));
const ROMAN = /^(?=[IVXLCDM]{2,}$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/**
 * Organizers type a lot of titles in capitals ("MARSHALL $700 FIDE BLITZ").
 * A name that is entirely upper case is set in title case, leaving initials,
 * ratings floors and numerals alone: "Marshall $700 FIDE Blitz". Mixed-case
 * names are the organizer's own choice and are not touched.
 */
export function displayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length < 6 || letters !== letters.toUpperCase()) return trimmed;
  return trimmed
    .split(" ")
    .map((word, i) => {
      const core = word.replace(/[^A-Za-z0-9]/g, "");
      if (/^\d+(ST|ND|RD|TH)$/.test(core)) return word.toLowerCase(); // 24TH → 24th
      if (!core || /\d/.test(core)) return word; // U2200, G/60, $700
      const lower = core.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return word.toLowerCase();
      if (ACRONYMS.has(lower) || ROMAN.test(core)) return word;
      // Three letters shaped consonant-vowel-consonant read as a word or a
      // first name (Tim, Sam, Cup, Fun); other short runs are initials (CKQ, NY).
      const wordLike = SHORT_WORDS.has(lower) || /^[^aeiou][aeiou][^aeiou]$/.test(lower);
      if (core.length <= 3 && !wordLike) return word;
      return word
        .toLowerCase()
        .replace(/(^|[-/(&"“])([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
    })
    .join(" ");
}

// ─── Items ───

export const clubItem = (spot: SpotRaw): Item => ({ kind: "club", id: spot.id, spot });
export const eventItem = (event: ChessEvent): Item => ({
  kind: "tournament",
  id: event.id,
  event,
});
export const itemKey = (item: Item) => `${item.kind}:${item.id}`;
export const itemName = (item: Item) =>
  item.kind === "club" ? item.spot.name : displayName(item.event.name);

export function itemCoords(item: Item): [number, number] | null {
  const { lat, lng } = item.kind === "club" ? item.spot : item.event;
  if (item.kind === "tournament" && !hasPin(item.event)) return null;
  return lat != null && lng != null ? [lng, lat] : null;
}

export function itemMatches(item: Item, f: Filters, today: string): boolean {
  return item.kind === "club"
    ? clubMatches(item.spot, f, today)
    : eventMatches(item.event, f, today);
}

/** `#club=<id>` / `#event=<id>` — what an open popup puts in the URL. */
export function itemHash(item: Item): string {
  return `#${item.kind === "club" ? "club" : "event"}=${encodeURIComponent(item.id)}`;
}
export function parseItemHash(hash: string): { kind: Kind; id: string } | null {
  const match = hash.match(/^#(club|event)=(.+)$/);
  if (!match) return null;
  return {
    kind: match[1] === "club" ? "club" : "tournament",
    id: decodeURIComponent(match[2]),
  };
}

// ─── Map pins ───

/** Tournaments pinned to the same spot share one pin; most are ZIP-code pins. */
export const coordKey = (lat: number, lng: number) =>
  `${lat.toFixed(4)},${lng.toFixed(4)}`;

export type Bounds = { west: number; east: number; south: number; north: number };

export function inBounds(item: Item, b: Bounds): boolean {
  const at = itemCoords(item);
  if (!at) return false;
  const [lng, lat] = at;
  return (
    lat >= b.south &&
    lat <= b.north &&
    (b.west <= b.east ? lng >= b.west && lng <= b.east : lng >= b.west || lng <= b.east)
  );
}

// ─── URL ───

const DAY_CODES = DAYS.map((day) => day.slice(0, 3).toLowerCase());
const KIND_CODES: Record<Kind, string> = { club: "clubs", tournament: "tournaments" };
const sameSet = <T>(a: T[], b: T[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

/** Query string for the filters, leaving out whatever matches the page's own defaults. */
export function filtersToParams(f: Filters, base: Filters = defaultFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (!sameSet(f.kinds, base.kinds))
    params.set("find", f.kinds.length ? f.kinds.map((k) => KIND_CODES[k]).join(",") : "all");
  if (f.formats.length) params.set("play", f.formats.join(","));
  if (f.days.length)
    params.set("day", f.days.map((day) => DAY_CODES[DAYS.indexOf(day)]).join(","));
  if (f.when === "today" || f.when === "weekend") params.set("when", f.when);
  if (f.when === "custom") {
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);
  }
  if (f.big) params.set("big", "1");
  return params;
}

const isIsoDate = (value: string | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function filtersFromParams(
  params: URLSearchParams,
  base: Filters = defaultFilters,
): Filters {
  const list = (key: string) => (params.get(key) || "").split(",").filter(Boolean);
  const find = list("find");
  const from = params.get("from");
  const to = params.get("to");
  const when = params.get("when");
  const custom = isIsoDate(from) || isIsoDate(to);
  return {
    kinds: params.has("find")
      ? KINDS.filter((kind) => find.includes(KIND_CODES[kind]))
      : base.kinds,
    formats: FORMATS.filter((format) => list("play").includes(format)),
    days: DAYS.filter((_, i) => list("day").includes(DAY_CODES[i])),
    when: when === "today" || when === "weekend" ? when : custom ? "custom" : "any",
    from: custom && isIsoDate(from) ? from : "",
    to: custom && isIsoDate(to) ? to : "",
    big: params.get("big") === "1",
  };
}

// ─── Search ───

function haystack(item: Item): string {
  const parts =
    item.kind === "club"
      ? [item.spot.name, item.spot.address, item.spot.city, item.spot.state, item.spot.notes]
      : [
          item.event.name,
          item.event.city,
          item.event.state,
          item.event.venue,
          item.event.organizer,
          item.event.address,
          ...(item.event.sections || []).map((section) => section.name),
        ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export const tokenize = (query: string) =>
  query.trim().toLowerCase().split(/\s+/).filter(Boolean);

export function matchesQuery(item: Item, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const text = haystack(item);
  return tokens.every((token) => text.includes(token));
}

/** Best matches first: a name that starts with the query, then any name hit. */
export function searchItems(items: Item[], query: string, limit = 8): Item[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const phrase = tokens.join(" ");
  const scored: { item: Item; score: number }[] = [];
  for (const item of items) {
    if (!matchesQuery(item, tokens)) continue;
    const name = itemName(item).toLowerCase();
    const score = name.startsWith(phrase)
      ? 0
      : tokens.every((token) => name.includes(token))
        ? 1
        : 2;
    scored.push({ item, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

// ─── Feed ───

export type FeedEntry =
  | { kind: "tournament"; key: string; item: Item & { kind: "tournament" } }
  | { kind: "club"; key: string; item: Item & { kind: "club" }; day: DayOfWeek | null };
export type FeedGroup = { key: string; label: string; entries: FeedEntry[] };

/** How many days ahead weekly club nights are written out date by date. */
const CLUB_DAYS_AHEAD = 7;

function dayLabel(iso: string, today: string): string {
  if (iso === today) return `Today · ${shortDate(iso, today)}`;
  if (iso === addDays(today, 1)) return `Tomorrow · ${shortDate(iso, today)}`;
  return shortDate(iso, today);
}

/**
 * The feed: one group per date. Tournaments sit on their start date (or under
 * "Happening now" once started); a club appears on each of its meeting days
 * for the coming week, the way a weekly night shows up on a listings page.
 * Clubs whose meeting day is unknown close the list.
 */
export function buildFeed(items: Item[], f: Filters, today: string): FeedGroup[] {
  const { from, to } = dateWindow(f, today);
  const groups = new Map<string, FeedGroup>();
  const group = (key: string, label: string) => {
    let found = groups.get(key);
    if (!found) groups.set(key, (found = { key, label, entries: [] }));
    return found;
  };
  const clubs: (Item & { kind: "club" })[] = [];

  for (const item of items) {
    if (item.kind === "club") {
      clubs.push(item);
      continue;
    }
    const { date, endDate } = item.event;
    // A weekend open that started yesterday is news; a league that runs all
    // year is not, so long series wait at the end instead of leading the page.
    const target =
      date >= from
        ? group(date, dayLabel(date, today))
        : daysBetween(date, endDate || date) <= 7
          ? group("0", "Happening now")
          : group("y", "Ongoing series and leagues");
    target.entries.push({ kind: "tournament", key: `t:${item.id}`, item });
  }

  for (let i = 0; i < CLUB_DAYS_AHEAD; i++) {
    const date = addDays(from, i);
    if (to != null && date > to) break;
    const day = weekdayOf(date);
    if (f.days.length && !f.days.includes(day)) continue;
    const meeting = clubs
      .filter((club) => club.spot.hours?.[day] != null)
      .sort(
        (a, b) =>
          (a.spot.hours?.[day]?.open || "99").localeCompare(b.spot.hours?.[day]?.open || "99") ||
          a.spot.name.localeCompare(b.spot.name),
      );
    if (!meeting.length) continue;
    const target = group(date, dayLabel(date, today));
    for (const item of meeting)
      target.entries.push({ kind: "club", key: `c:${item.id}:${date}`, item, day });
  }

  const sorted = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const g of sorted)
    g.entries.sort(
      (a, b) =>
        Number(a.kind === "club") - Number(b.kind === "club") ||
        (a.kind === "tournament" && b.kind === "tournament"
          ? a.item.event.name.localeCompare(b.item.event.name)
          : 0),
    );

  const undated = clubs
    .filter((club) => !clubDays(club.spot).length)
    .sort((a, b) => a.spot.name.localeCompare(b.spot.name));
  if (undated.length)
    sorted.push({
      key: "z",
      label: "Clubs · ask for meeting times",
      entries: undated.map((item) => ({ kind: "club", key: `c:${item.id}`, item, day: null })),
    });
  return sorted;
}
