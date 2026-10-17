import { describe, expect, test } from "bun:test";
import { LAYOUTS, layoutOfParam, layoutOfShortcut } from "../../src/web/src/lib/layouts.ts";
import type { Layout, View } from "../../src/web/src/lib/view.ts";

describe("drawerOverlay", () => {
  test.each([
    ["calendar", "month", true],
    ["calendar", "week", true],
    ["calendar", "day", false],
    ["live", "day", true],
    ["live", "week", true],
    ["today", "week", true],
    ["table", "week", false],
    ["summary", "month", false],
  ] as [Layout, View, boolean][])("%s / %s → %p", (layout, view, expected) => {
    expect(LAYOUTS[layout].drawerOverlay(view)).toBe(expected);
  });
});

describe("stepping", () => {
  test("steps through blocks everywhere but the live page", () => {
    expect(LAYOUTS.calendar.stepping.blocks).toBe(true);
    expect(LAYOUTS.table.stepping.blocks).toBe(true);
    expect(LAYOUTS.summary.stepping.blocks).toBe(true);
    expect(LAYOUTS.live.stepping.blocks).toBe(false);
  });

  test("steps through a burst of runs only on the calendar", () => {
    expect(LAYOUTS.calendar.stepping.runs).toBe(true);
    expect(LAYOUTS.table.stepping.runs).toBe(false);
    expect(LAYOUTS.summary.stepping.runs).toBe(false);
    expect(LAYOUTS.live.stepping.runs).toBe(false);
  });
});

describe("layoutOfParam", () => {
  test("reads each layout's URL value, the table under its old name", () => {
    expect(layoutOfParam("summary")).toBe("summary");
    expect(layoutOfParam("list")).toBe("table");
    expect(layoutOfParam("live")).toBe("live");
  });

  test("none, or anything unknown, is the home page", () => {
    for (const v of [null, "", "table", "grid"]) expect(layoutOfParam(v)).toBe("today");
  });

  test("a URL giving a period without a layout opens the calendar, as links before the home page did", () => {
    for (const v of [null, "", "grid"])
      expect(layoutOfParam(v, { carriesPeriod: true })).toBe("calendar");
    expect(layoutOfParam("summary", { carriesPeriod: true })).toBe("summary");
  });

  test("every layout round-trips through its URL value", () => {
    for (const [layout, { param }] of Object.entries(LAYOUTS))
      expect(layoutOfParam(param)).toBe(layout as Layout);
  });
});

describe("layoutOfShortcut", () => {
  test("maps each layout's key to it, and other shortcuts to none", () => {
    expect(layoutOfShortcut("home")).toBe("today");
    expect(layoutOfShortcut("calendar")).toBe("calendar");
    expect(layoutOfShortcut("summary")).toBe("summary");
    expect(layoutOfShortcut("table")).toBe("table");
    expect(layoutOfShortcut("live")).toBe("live");
    expect(layoutOfShortcut("week")).toBeNull();
  });
});

test("only the home and live pages have no period", () => {
  expect(
    Object.entries(LAYOUTS)
      .filter(([, t]) => !t.hasPeriod)
      .map(([l]) => l),
  ).toEqual(["today", "live"]);
});

test("a page without a period names its heading, and one with a period leaves it to the date", () => {
  for (const t of Object.values(LAYOUTS)) expect(t.heading === null).toBe(t.hasPeriod);
});
