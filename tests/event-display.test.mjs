import { test } from "node:test";
import assert from "node:assert/strict";
import { presetRange, eventCalendarUrl } from "../lib/event-display.ts";

test("weekend preset respects remaining weekend and month/year boundaries", () => {
  assert.deepEqual(presetRange("weekend", "2026-10-03"), {
    from: "2026-10-03",
    to: "2026-10-04",
  });
  assert.deepEqual(presetRange("weekend", "2026-10-04"), {
    from: "2026-10-04",
    to: "2026-10-04",
  });
  assert.deepEqual(presetRange("weekend", "2026-12-31"), {
    from: "2027-01-01",
    to: "2027-01-03",
  });
  assert.deepEqual(presetRange("month", "2026-12-15"), {
    from: "2026-12-15",
    to: "2027-01-13",
  });
});
test("calendar uses exclusive all-day end, handles year rollover, preserves organizer schedule", () => {
  const event = {
    name: "Winter Open",
    date: "2026-12-31",
    endDate: "2027-01-02",
    notes: "Round 1 at 7pm",
    website: "https://example.com/event",
  };
  const url = new URL(eventCalendarUrl(event));
  assert.equal(url.searchParams.get("dates"), "20261231/20270103");
  assert.match(url.searchParams.get("details"), /Dates only/);
  assert.match(url.searchParams.get("details"), /Round 1 at 7pm/);
});
test("calendar never treats a season-long series or invalid range as a continuous event", () => {
  assert.equal(
    eventCalendarUrl({
      name: "League",
      date: "2026-01-01",
      endDate: "2026-12-31",
    }),
    null,
  );
  assert.equal(
    eventCalendarUrl({
      name: "Broken range",
      date: "2026-10-04",
      endDate: "2026-10-03",
    }),
    null,
  );
  assert.equal(
    eventCalendarUrl({ name: "Invalid date", date: "invalid" }),
    null,
  );
});
