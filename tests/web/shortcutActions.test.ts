import { describe, expect, test } from "bun:test";
import { runShortcut, type ShortcutTargets } from "../../src/web/src/lib/shortcutActions.ts";
import type { UrlState } from "../../src/web/src/lib/urlState.ts";
import { at, DAY0 } from "./helpers.ts";

/** Targets on a page, recording what each shortcut changed and called. */
function targets(
  state: Partial<ShortcutTargets["state"]> = {},
  more: Partial<ShortcutTargets> = {},
) {
  const patches: Partial<UrlState>[] = [];
  const calls: string[] = [];
  const t: ShortcutTargets = {
    state: { view: "week", layout: "calendar", anchor: DAY0, session: null, ...state },
    update: (patch) => patches.push(patch),
    now: at(30),
    prev: null,
    next: { id: "s", at: 1 },
    goTo: (b) => calls.push(`goTo ${b?.id}`),
    run: null,
    closeDrawer: () => calls.push("close"),
    toggleMenu: () => calls.push("menu"),
    focusSearch: () => calls.push("search"),
    togglePalette: () => calls.push("palette"),
    ...more,
  };
  return { t, patches, calls };
}

describe("runShortcut", () => {
  test("moves the period, and today is the day holding the time it is handed", () => {
    const { t, patches } = targets();
    expect(runShortcut("nextPeriod", t)).toBe(true);
    expect(runShortcut("today", t)).toBe(true);
    expect(patches).toEqual([{ anchor: DAY0 + 7 * 86_400_000 }, { anchor: at(24) }]);
  });

  test("on Today, period keys pass through, and picking a length goes to the calendar", () => {
    const { t, patches, calls } = targets({ layout: "today" });
    expect(runShortcut("prevPeriod", t)).toBe(false);
    expect(runShortcut("nextBlock", t)).toBe(false);
    expect(runShortcut("day", t)).toBe(true);
    expect(patches).toEqual([{ layout: "calendar", view: "day" }]);
    expect(calls).toEqual([]);
  });

  test("Esc closes the drawer only when there is one to close", () => {
    const open = targets({ session: "s" });
    expect(runShortcut("close", open.t)).toBe(true);
    expect(open.calls).toEqual(["close"]);
    expect(runShortcut("close", targets({ session: "s" }, { closeDrawer: null }).t)).toBe(false);
    expect(runShortcut("close", targets().t)).toBe(false);
  });

  test("the rest call their targets", () => {
    const { t, calls } = targets();
    for (const s of ["nextBlock", "menu", "search", "palette"] as const) runShortcut(s, t);
    expect(calls).toEqual(["goTo s", "menu", "search", "palette"]);
  });
});
