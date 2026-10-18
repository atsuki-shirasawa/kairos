import { describe, expect, test } from "bun:test";
import { LAYOUTS, layoutOfShortcut, layoutOfTab } from "../../src/web/src/lib/layouts.ts";
import type { Layout, View } from "../../src/web/src/lib/view.ts";

describe("drawerOverlay", () => {
  test.each([
    ["calendar", "month", true],
    ["calendar", "week", true],
    ["calendar", "day", false],
    ["today", "week", true],
    ["table", "week", false],
    ["summary", "month", false],
  ] as [Layout, View, boolean][])("%s / %s → %p", (layout, view, expected) => {
    expect(LAYOUTS[layout].drawerOverlay(view)).toBe(expected);
  });
});

describe("stepping", () => {
  test("steps through blocks everywhere but Today", () => {
    expect(LAYOUTS.calendar.stepping.blocks).toBe(true);
    expect(LAYOUTS.table.stepping.blocks).toBe(true);
    expect(LAYOUTS.summary.stepping.blocks).toBe(true);
    expect(LAYOUTS.today.stepping.blocks).toBe(false);
  });

  test("steps through a burst of runs only on the calendar", () => {
    expect(LAYOUTS.calendar.stepping.runs).toBe(true);
    expect(LAYOUTS.table.stepping.runs).toBe(false);
    expect(LAYOUTS.summary.stepping.runs).toBe(false);
    expect(LAYOUTS.today.stepping.runs).toBe(false);
  });
});

describe("layoutOfTab", () => {
  test("reads each Journal tab's value; none, or anything unknown, is the calendar", () => {
    expect(layoutOfTab("insights")).toBe("summary");
    expect(layoutOfTab("table")).toBe("table");
    for (const v of [null, "", "calendar", "grid"]) expect(layoutOfTab(v)).toBe("calendar");
  });

  test("every Journal layout round-trips through its tab value", () => {
    for (const [layout, { tab, hasPeriod }] of Object.entries(LAYOUTS))
      if (hasPeriod) expect(layoutOfTab(tab)).toBe(layout as Layout);
  });
});

describe("layoutOfShortcut", () => {
  test("maps each layout's key to it, and other shortcuts to none", () => {
    expect(layoutOfShortcut("home")).toBe("today");
    expect(layoutOfShortcut("calendar")).toBe("calendar");
    expect(layoutOfShortcut("summary")).toBe("summary");
    expect(layoutOfShortcut("table")).toBe("table");
    expect(layoutOfShortcut("week")).toBeNull();
  });
});

test("only the home page has no period", () => {
  expect(
    Object.entries(LAYOUTS)
      .filter(([, t]) => !t.hasPeriod)
      .map(([l]) => l),
  ).toEqual(["today"]);
});

test("a page without a period names its heading, and one with a period leaves it to the date", () => {
  for (const t of Object.values(LAYOUTS)) expect(t.heading === null).toBe(t.hasPeriod);
});
