// Coaches & schools: who teaches chess, which of them pass the filters, and
// in what order. Pure functions, so `node --test` can load this file as is.
import { displayName } from "./explore.ts";
import { milesBetween, type Near } from "./tournaments.ts";
import { STATES } from "./us-states.ts";

export type LearnKind = "coach" | "academy" | "club";
export type Offer = "lessons" | "classes" | "camps";

export interface LearnListing {
  id: string;
  kind: LearnKind;
  name: string;
  /** Chess title of a coach: GM, IM, FM, NM… */
  title?: string;
  city?: string;
  state?: string;
  /** A coach's location in their own words, when it is not a US town. */
  place?: string;
  lat?: number;
  lng?: number;
  /** "venue" is the door; "postal" and "city" are the middle of a ZIP code or town. */
  precision?: "venue" | "postal" | "city";
  offers: Offer[];
  beginners?: boolean;
  kids?: boolean;
  online?: boolean;
  fideRating?: number;
  rate?: string;
  languages?: string[];
  notes?: string;
  lastActive?: string;
  website?: string;
  /** Set when the place also has a pin on the club map. */
  clubId?: string;
  source: "uscf" | "lichess";
}

export type LearnData = {
  updatedAt: string;
  coachesFetchedAt: string | null;
  listings: LearnListing[];
};

export const LEARN_KINDS: LearnKind[] = ["coach", "academy", "club"];
export const KIND_NAMES: Record<LearnKind, { one: string; many: string }> = {
  coach: { one: "Coach", many: "Coaches" },
  academy: { one: "School or academy", many: "Schools & academies" },
  club: { one: "Club that teaches", many: "Clubs that teach" },
};
export const OFFERS: Offer[] = ["lessons", "classes", "camps"];
export const OFFER_LABELS: Record<Offer, string> = {
  lessons: "Private lessons",
  classes: "Group classes",
  camps: "Camps",
};

export type LSort = "type" | "distance" | "name";

export type LFilters = {
  q: string;
  near: Near | null;
  /** Miles from `near`; 0 measures without a cut-off. */
  radius: number;
  state: string;
  kinds: LearnKind[];
  offers: Offer[];
  /** Coaches holding a master title. */
  titled: boolean;
  beginners: boolean;
  kids: boolean;
};

export const defaultLFilters: LFilters = {
  q: "",
  near: null,
  radius: 50,
  state: "",
  kinds: [],
  offers: [],
  titled: false,
  beginners: false,
  kids: false,
};

export const LEARN_RADII = [25, 50, 100, 250, 0];

// ─── Rows ───

export type LRow = {
  listing: LearnListing;
  name: string;
  text: string;
  miles: number | null;
};

export function buildLearnRows(listings: LearnListing[], near: Near | null): LRow[] {
  return listings.map((listing) => ({
    listing,
    name: displayName(listing.name),
    text: [
      listing.name,
      listing.title,
      listing.city,
      listing.state,
      listing.state ? STATES[listing.state] : "",
      listing.place,
      listing.notes,
      ...(listing.languages || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    miles:
      near && listing.lat != null && listing.lng != null
        ? milesBetween(near, { lat: listing.lat, lng: listing.lng })
        : null,
  }));
}

/** Everything except place: what kind of teaching is wanted. */
function matchesNeeds(row: LRow, f: LFilters, tokens: string[]): boolean {
  const { listing } = row;
  if (f.kinds.length && !f.kinds.includes(listing.kind)) return false;
  if (f.offers.length && !f.offers.some((offer) => listing.offers.includes(offer))) return false;
  if (f.titled && !(listing.kind === "coach" && listing.title)) return false;
  // Coaches set their own terms; the two "good for" pills describe places.
  if (f.beginners && !listing.beginners) return false;
  if (f.kids && !listing.kids) return false;
  return tokens.every((token) => row.text.includes(token));
}

function matchesPlace(row: LRow, f: LFilters): boolean {
  if (f.near && f.radius > 0) return row.miles != null && row.miles <= f.radius;
  if (f.state) return row.listing.state === f.state;
  return true;
}

/**
 * `local` is what is in the place asked for. `online` is the coaches outside
 * it: a lesson over the internet does not care where the coach lives, so they
 * are offered after the local results rather than hidden. With no place
 * chosen everything is local.
 */
export function filterLearn(rows: LRow[], f: LFilters): { local: LRow[]; online: LRow[] } {
  const tokens = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const local: LRow[] = [];
  const online: LRow[] = [];
  for (const row of rows) {
    if (!matchesNeeds(row, f, tokens)) continue;
    if (matchesPlace(row, f)) local.push(row);
    else if (row.listing.kind === "coach" && row.listing.online) online.push(row);
  }
  return { local, online };
}

export function activeLearnFilterCount(f: LFilters): number {
  return (
    f.kinds.length +
    f.offers.length +
    Number(f.titled) +
    Number(f.beginners) +
    Number(f.kids) +
    Number(f.state !== "")
  );
}

// ─── Sorting and grouping ───

const TITLE_RANK = ["GM", "IM", "WGM", "FM", "WIM", "NM", "CM", "WFM", "WCM", "WNM"];
const titleRank = (title?: string) => {
  const rank = title ? TITLE_RANK.indexOf(title) : -1;
  return rank < 0 ? TITLE_RANK.length : rank;
};

/** Strongest title first, then rating, then name. */
const byStrength = (a: LRow, b: LRow) =>
  titleRank(a.listing.title) - titleRank(b.listing.title) ||
  (b.listing.fideRating ?? 0) - (a.listing.fideRating ?? 0) ||
  a.name.localeCompare(b.name);

const byPlace = (a: LRow, b: LRow) =>
  `${a.listing.state || "~"} ${a.listing.city || "~"}`.localeCompare(
    `${b.listing.state || "~"} ${b.listing.city || "~"}`,
  ) || a.name.localeCompare(b.name);

const byDistance = (a: LRow, b: LRow) =>
  a.miles == null || b.miles == null
    ? Number(a.miles == null) - Number(b.miles == null) || a.name.localeCompare(b.name)
    : a.miles - b.miles;

export type LGroup = { key: string; label: string; rows: LRow[] };

/** Sections for the list: by kind, or one run in distance or name order. */
export function groupLearn(local: LRow[], online: LRow[], sort: LSort): LGroup[] {
  const groups: LGroup[] = [];
  if (sort === "type") {
    for (const kind of LEARN_KINDS) {
      const rows = local.filter((row) => row.listing.kind === kind);
      if (rows.length)
        groups.push({
          key: kind,
          label: KIND_NAMES[kind].many,
          rows: rows.sort(kind === "coach" ? byStrength : byPlace),
        });
    }
  } else if (local.length) {
    groups.push({
      key: "all",
      label: "",
      rows: [...local].sort(sort === "distance" ? byDistance : (a, b) => a.name.localeCompare(b.name)),
    });
  }
  if (online.length)
    groups.push({
      key: "online",
      label: "Coaches who teach online, from anywhere",
      rows: [...online].sort(byStrength),
    });
  return groups;
}

/** "Berkeley, CA", a coach's own wording, or the country. */
export function learnPlace(listing: LearnListing): string {
  const town = [listing.city, listing.state].filter(Boolean).join(", ");
  if (listing.city) return town;
  if (listing.kind === "coach")
    return listing.state ? STATES[listing.state] || listing.state : listing.place || "United States";
  return town || "United States";
}

// ─── URL ───

export function lFiltersToParams(f: LFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.near) {
    params.set("near", `${f.near.lat.toFixed(3)},${f.near.lng.toFixed(3)}`);
    params.set("place", f.near.label);
    if (f.radius !== defaultLFilters.radius) params.set("within", String(f.radius));
  }
  if (f.state) params.set("state", f.state);
  if (f.kinds.length) params.set("show", f.kinds.join(","));
  if (f.offers.length) params.set("offers", f.offers.join(","));
  if (f.titled) params.set("titled", "1");
  if (f.beginners) params.set("beginners", "1");
  if (f.kids) params.set("kids", "1");
  return params;
}

export function lFiltersFromParams(params: URLSearchParams): LFilters {
  const list = (key: string) => (params.get(key) || "").split(",").filter(Boolean);
  const [lat, lng] = (params.get("near") || "").split(",").map(Number);
  const hasNear =
    params.has("near") && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90;
  const within = Number(params.get("within"));
  const state = (params.get("state") || "").toUpperCase();
  return {
    q: params.get("q") || "",
    near: hasNear ? { lat, lng, label: params.get("place") || "your place" } : null,
    radius: params.has("within") && LEARN_RADII.includes(within) ? within : defaultLFilters.radius,
    state: !hasNear && STATES[state] ? state : "",
    kinds: LEARN_KINDS.filter((kind) => list("show").includes(kind)),
    offers: OFFERS.filter((offer) => list("offers").includes(offer)),
    titled: params.get("titled") === "1",
    beginners: params.get("beginners") === "1",
    kids: params.get("kids") === "1",
  };
}
