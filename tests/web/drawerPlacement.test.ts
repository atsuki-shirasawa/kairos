import { describe, expect, test } from "bun:test";
import { drawerOverlay, drawerStepping } from "../../src/web/src/lib/drawerPlacement.ts";
import type { Layout, View } from "../../src/web/src/lib/view.ts";

describe("drawerOverlay", () => {
  test.each([
    ["calendar", "month", true],
    ["calendar", "week", true],
    ["calendar", "day", false],
    ["live", "day", true],
    ["live", "week", true],
    ["list", "week", false],
    ["summary", "month", false],
  ] as [Layout, View, boolean][])("%s / %s → %p", (layout, view, expected) => {
    expect(drawerOverlay(layout, view)).toBe(expected);
  });
});

describe("drawerStepping", () => {
  test("steps through blocks everywhere but the live page", () => {
    expect(drawerStepping("calendar").blocks).toBe(true);
    expect(drawerStepping("list").blocks).toBe(true);
    expect(drawerStepping("summary").blocks).toBe(true);
    expect(drawerStepping("live").blocks).toBe(false);
  });

  test("steps through a burst of runs only on the calendar", () => {
    expect(drawerStepping("calendar").runs).toBe(true);
    expect(drawerStepping("list").runs).toBe(false);
    expect(drawerStepping("summary").runs).toBe(false);
    expect(drawerStepping("live").runs).toBe(false);
  });
});
