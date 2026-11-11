import type { ChessEvent } from "../types/event";

export type Bounds = {
  west: number;
  east: number;
  south: number;
  north: number;
};
export type EventFilters = {
  q: string;
  state: string;
  from: string;
  to: string;
  rating: string;
  format: string;
  source: string;
  audience: string;
  mode: string;
  type: string;
};
export const emptyFilters: EventFilters = {
  q: "",
  state: "",
  from: "",
  to: "",
  rating: "",
  format: "",
  source: "",
  audience: "",
  mode: "in-person",
  type: "",
};
export const sourceNames: Record<string, string> = {
  uscf: "US Chess",
  nachesshub: "NA Chess Hub",
  boylston: "Boylston",
  maca: "MACA",
  cca: "Continental Chess",
};
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function hasCoordinates(
  e: ChessEvent,
): e is ChessEvent & { lat: number; lng: number } {
  return (
    !e.online &&
    typeof e.lat === "number" &&
    typeof e.lng === "number" &&
    Number.isFinite(e.lat) &&
    Number.isFinite(e.lng) &&
    Math.abs(e.lat) <= 90 &&
    Math.abs(e.lng) <= 180
  );
}
export function withinBounds(e: ChessEvent, b: Bounds): boolean {
  return (
    hasCoordinates(e) &&
    e.lat >= b.south &&
    e.lat <= b.north &&
    (b.west <= b.east
      ? e.lng >= b.west && e.lng <= b.east
      : e.lng >= b.west || e.lng <= b.east)
  );
}
export function filterEvents(
  events: ChessEvent[],
  f: EventFilters,
  today: string,
  bounds?: Bounds,
): ChessEvent[] {
  return events.filter((e) => {
    if (e.cancellationEvidence) return false;
    const end = e.endDate || e.date;
    if (f.type && e.type !== f.type) return false;
    if (end < today || (f.from && end < f.from) || (f.to && e.date > f.to))
      return false;
    if (f.state && e.state !== f.state) return false;
    if (
      (f.mode === "online" && !e.online) ||
      (f.mode === "in-person" && e.online)
    )
      return false;
    if (f.rating === "USCF" && !(e.rated && e.ratingSystem === "USCF"))
      return false;
    if (f.rating === "FIDE" && !(e.fideRated || e.ratingSystem === "FIDE"))
      return false;
    if (f.rating === "unrated" && e.rated !== false) return false;
    if (f.format && (e.format || e.timeControl?.kind) !== f.format && !e.timeControls?.some((tc) => tc.kind === f.format))
      return false;
    if (
      f.source &&
      !(e.source === f.source || e.sources?.some((s) => s.id === f.source))
    )
      return false;
    if (f.audience && e.audience !== f.audience) return false;
    if (bounds && !withinBounds(e, bounds)) return false;
    const searchable = [
      e.name,
      e.city,
      e.state,
      e.venue,
      e.organizer,
      e.address,
      ...(e.sections || []).map((s) => s.name),
    ]
      .join(" ")
      .toLowerCase();
    return f.q
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((word) => searchable.includes(word));
  });
}
export type EventSort = "date" | "name" | "location" | "prize";
export function sortEvents(
  events: ChessEvent[],
  sort: EventSort,
  descending = false,
): ChessEvent[] {
  return [...events].sort((a, b) => {
    // Unknown prize funds always go last, even when reversing the order.
    const pa = a.prizeFundUsd ?? a.prizeFundGuaranteedUsd,
      pb = b.prizeFundUsd ?? b.prizeFundGuaranteedUsd;
    if (sort === "prize" && (pa == null || pb == null))
      return pa == null && pb == null
        ? a.date.localeCompare(b.date)
        : pa == null
          ? 1
          : -1;
    const result =
      sort === "prize"
        ? pb! - pa!
        : sort === "location"
          ? `${a.state || "~"} ${a.city || ""}`.localeCompare(
              `${b.state || "~"} ${b.city || ""}`,
            )
          : a[sort].localeCompare(b[sort]);
    return (
      (descending ? -result : result) ||
      a.date.localeCompare(b.date) ||
      a.name.localeCompare(b.name)
    );
  });
}
export function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export const money = (value?: number) =>
  value == null
    ? "—"
    : value === 0
      ? "$0"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(value);
export const eventLocation = (e: ChessEvent) =>
  e.online
    ? "Online"
    : [e.city, e.state].filter(Boolean).join(", ") ||
      e.address ||
      "Location to be confirmed";
