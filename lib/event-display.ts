import type { ChessEvent } from "../types/event";

export type DatePreset = "any" | "today" | "weekend" | "month";
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function presetRange(
  preset: DatePreset,
  today: string,
): { from: string; to: string } {
  if (preset === "any" || !today) return { from: "", to: "" };
  const start = new Date(`${today}T12:00:00`);
  let end = new Date(start);
  if (preset === "weekend") {
    // Include Friday; on Saturday/Sunday, show the remaining weekend.
    const daysToFriday =
      start.getDay() === 0 ? 0 : Math.max(0, 5 - start.getDay());
    start.setDate(start.getDate() + daysToFriday);
    end = new Date(start);
    end.setDate(end.getDate() + ((7 - start.getDay()) % 7));
  } else if (preset === "month") end.setDate(end.getDate() + 29);
  return { from: isoDay(start), to: isoDay(end) };
}

/** Calendar links reserve known dates, not guessed round times or long series. */
export function eventCalendarUrl(event: ChessEvent): string | null {
  const start = new Date(`${event.date}T00:00:00Z`);
  const end = new Date(`${event.endDate || event.date}T00:00:00Z`);
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (!Number.isFinite(days) || days < 0 || days > 6) return null;
  end.setUTCDate(end.getUTCDate() + 1);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${event.date.replaceAll("-", "")}/${end.toISOString().slice(0, 10).replaceAll("-", "")}`,
    details: [
      "Dates only — confirm start and round times with the organizer.",
      event.dateText,
      eventSchedule(event),
      event.website,
    ]
      .filter(Boolean)
      .join("\n"),
    location: event.online
      ? "Online"
      : [
          event.venue,
          event.address || [event.city, event.state].filter(Boolean).join(", "),
        ]
          .filter(Boolean)
          .join(", "),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Keep organizer-provided notes intact; never infer a start time from round times. */
export function eventSchedule(event: ChessEvent): string | undefined {
  return (
    [event.time, event.scheduleText?.trim(), event.notes?.trim()].filter(Boolean).join(" · ") || undefined
  );
}

export function eventGroup(event: ChessEvent, today: string): string {
  if (event.date < today) return "Ongoing & recurring";
  if (event.date === today) return "Today";
  return new Date(`${event.date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
