import { afterEach, describe, expect, test } from "bun:test";
import type { Project, SearchHit } from "../../src/shared/api.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import { NO_FILTER } from "../../src/web/src/lib/filter.ts";
import {
  clampRow,
  commandKey,
  dateCommand,
  matchCommands,
  type PaletteContext,
  paletteCommands,
  paletteContext,
  paletteRowId,
  paletteRows,
  queryCommands,
  staysOpen,
  stepRow,
} from "../../src/web/src/lib/palette.ts";
import { keyCap } from "../../src/web/src/lib/shortcuts.ts";

/** Wednesday, 2026-10-07 (local time). */
const NOW = new Date(2026, 9, 7, 15, 0).getTime();

const project = (id: number, name: string, hidden = false) =>
  ({ id, name, hidden, color: null }) as unknown as Project;

/** The Journal's week calendar with nothing open, no filters, and two projects. */
const CTX: PaletteContext = {
  now: NOW,
  layout: "calendar",
  view: "week",
  sessionOpen: false,
  reportReady: true,
  shownReady: true,
  filtered: false,
  projects: [project(1, "atlas"), project(2, "harbor", true)],
  theme: "system",
  locale: "en",
  showHeadless: false,
};

const ids = (ctx: Partial<PaletteContext>, query = "") =>
  queryCommands({ ...CTX, ...ctx }, query).map((c) => c.id);

afterEach(() => setLocale("en"));

describe("paletteCommands", () => {
  test("offers every toolbar action on the Journal, each with its key when it has one", () => {
    setLocale("en");
    const all = paletteCommands(CTX);
    expect(all.map((c) => c.id)).toEqual([
      "layout-today",
      "layout-calendar",
      "layout-summary",
      "layout-table",
      "view-month",
      "view-week",
      "view-day",
      "move-prev",
      "move-next",
      "today",
      "step-next",
      "step-prev",
      "standup-lastWorkday",
      "standup-today",
      "standup-week",
      "standup-shown",
      "filters",
      "projects-all",
      "project-1",
      "project-2",
      "theme-light",
      "theme-dark",
      "locale-ja",
      "headless",
      "shortcuts",
    ]);
    const keys = Object.fromEntries(
      all.flatMap((c) => {
        const key = commandKey(c);
        return key ? [[c.id, keyCap(key)]] : [];
      }),
    );
    expect(keys).toMatchObject({ "layout-today": "h", "view-day": "d", "move-prev": "←" });
    expect(all.find((c) => c.id === "move-prev")?.label).toBe("Previous week");
  });

  test("on Today, only what doesn't need a period on screen", () => {
    const today = ids({ layout: "today" });
    expect(today).not.toContain("move-prev");
    expect(today).not.toContain("step-next");
    expect(today).not.toContain("standup-shown");
    expect(today).not.toContain("filters");
    expect(today).toContain("view-day");
  });

  test("resume and clearing the filters show only when there is something to act on", () => {
    expect(ids({})).not.toContain("resume");
    expect(ids({ sessionOpen: true })).toContain("resume");
    expect(ids({})).not.toContain("thread");
    expect(ids({ sessionOpen: true })).toContain("thread");
    expect(ids({ filtered: true })).toContain("clear-filters");
  });

  test("each project is offered as the change it makes", () => {
    const labels = paletteCommands(CTX)
      .filter((c) => c.action.kind === "project")
      .map((c) => c.label);
    expect(labels).toEqual(["Hide atlas", "Show harbor"]);
  });

  test("reports wait for the projects, and the period on screen for its own work", () => {
    expect(ids({ reportReady: false }).filter((id) => id.startsWith("standup"))).toEqual([]);
    expect(ids({ shownReady: false })).not.toContain("standup-shown");
    expect(ids({ shownReady: false })).toContain("standup-week");
  });

  test("headless runs wait for the settings before offering a change", () => {
    expect(ids({ showHeadless: null })).not.toContain("headless");
  });
});

describe("matchCommands / queryCommands", () => {
  test("matching alone never adds a date row; the query's day is queryCommands' to add", () => {
    expect(matchCommands(paletteCommands(CTX), "today").map((c) => c.id)).not.toContain("date");
    expect(dateCommand("yesterday", NOW)?.action).toEqual({
      kind: "date",
      day: new Date(2026, 9, 6).getTime(),
    });
    expect(dateCommand("token", NOW)).toBeNull();
  });

  test("with no query, everything but the projects, which would bury the rest", () => {
    expect(ids({})).not.toContain("project-1");
    expect(ids({})).toContain("projects-all");
  });

  test("keeps the commands holding every word, any case, in their label or group", () => {
    expect(ids({}, "WEEK")).toEqual(["view-week", "move-prev", "move-next", "standup-week"]);
    expect(ids({}, "copy standup today")).toEqual(["standup-today"]);
    expect(ids({}, "atlas")).toEqual(["project-1"]);
  });

  test("a query naming a day leads with a row going there", () => {
    const [first] = queryCommands(CTX, "2026-09-30");
    expect(first?.action).toEqual({ kind: "date", day: new Date(2026, 8, 30).getTime() });
    expect(first?.label).toBe("Go to Wed, Sep 30");
    expect(ids({}, "today")[0]).toBe("date");
  });

  test("labels follow the UI language", () => {
    setLocale("ja");
    expect(ids({}, "先週の火曜")).toEqual(["date"]);
    expect(queryCommands(CTX, "週").map((c) => c.label)).toContain("週表示");
  });
});

describe("paletteRows / stepRow", () => {
  test("commands come first, then at most eight hits", () => {
    const hit = (start: number) =>
      ({ sessionId: "s", start, end: start + 1, headline: "h" }) as unknown as SearchHit;
    const rows = paletteRows(
      paletteCommands(CTX).slice(0, 2),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(hit),
    );
    expect(rows.map((r) => r.kind)).toEqual(["command", "command", ...Array(8).fill("hit")]);
    expect(new Set(rows.map(paletteRowId)).size).toBe(rows.length);
  });

  test("↑ / ↓ wrap around at either end", () => {
    expect(stepRow(0, 3, -1)).toBe(2);
    expect(stepRow(2, 3, 1)).toBe(0);
    expect(stepRow(0, 0, 1)).toBe(-1);
  });
});

describe("staysOpen", () => {
  test("only a copy keeps the palette open, to say how it went", () => {
    expect(staysOpen({ kind: "standup", period: "today" })).toBe(true);
    expect(staysOpen({ kind: "resume" })).toBe(true);
    expect(staysOpen({ kind: "shortcut", shortcut: "month" })).toBe(false);
    expect(staysOpen({ kind: "filters" })).toBe(false);
    expect(staysOpen({ kind: "thread" })).toBe(false);
  });
});

describe("clampRow", () => {
  test("keeps the active row in a list that shrank under it", () => {
    expect(clampRow(5, 3)).toBe(2);
    expect(clampRow(1, 3)).toBe(1);
    expect(clampRow(0, 0)).toBe(-1);
  });
});

describe("paletteContext", () => {
  test("reads the open block and the filter the way the toolbar does", () => {
    const ctx = paletteContext({
      now: NOW,
      state: { layout: "calendar", view: "day", session: "s" },
      filter: { ...NO_FILTER, hideBrief: true },
      projects: [],
      theme: "dark",
      locale: "ja",
      showHeadless: null,
      reportReady: false,
      shownReady: false,
    });
    expect(ctx).toMatchObject({ view: "day", sessionOpen: true, filtered: true });
  });
});
