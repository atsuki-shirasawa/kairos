import { describe, expect, test } from "bun:test";
import { keyCap, SHORTCUT_GROUPS, shortcutFor } from "../../src/web/src/lib/shortcuts.ts";

describe("keyCap", () => {
  test("writes each shortcut's key as the menu and tooltips show it", () => {
    expect(keyCap("prevPeriod")).toBe("←");
    expect(keyCap("nextPeriod")).toBe("→");
    expect(keyCap("today")).toBe("t");
    expect(keyCap("table")).toBe("l");
    expect(keyCap("search")).toBe("/");
    expect(keyCap("close")).toBe("Esc");
    expect(keyCap("menu")).toBe("?");
  });
});

describe("SHORTCUT_GROUPS", () => {
  test("lists every shortcut exactly once", () => {
    const listed = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.length).toBe(16);
  });

  test("keeps the menu's lines and key caps", () => {
    expect(SHORTCUT_GROUPS.map((g) => g.shortcuts.map(keyCap))).toEqual([
      ["←", "→"],
      ["t"],
      ["m", "w", "d"],
      ["h", "c", "s", "n"],
      ["l"],
      ["j", "k"],
      ["/"],
      ["Esc"],
      ["?"],
    ]);
  });
});

describe("shortcutFor", () => {
  test("maps the documented keys", () => {
    expect(shortcutFor("ArrowLeft", false)).toBe("prevPeriod");
    expect(shortcutFor("ArrowRight", false)).toBe("nextPeriod");
    expect(shortcutFor("t", false)).toBe("today");
    expect(shortcutFor("m", false)).toBe("month");
    expect(shortcutFor("w", false)).toBe("week");
    expect(shortcutFor("d", false)).toBe("day");
    expect(shortcutFor("h", false)).toBe("home");
    expect(shortcutFor("c", false)).toBe("calendar");
    expect(shortcutFor("s", false)).toBe("summary");
    expect(shortcutFor("n", false)).toBe("live");
    expect(shortcutFor("j", false)).toBe("nextBlock");
    expect(shortcutFor("k", false)).toBe("prevBlock");
    expect(shortcutFor("Escape", false)).toBe("close");
  });

  test("/ focuses the search, but Shift+/ opens the menu like ?", () => {
    expect(shortcutFor("/", false)).toBe("search");
    expect(shortcutFor("/", true)).toBe("menu");
    expect(shortcutFor("?", true)).toBe("menu");
  });

  test("other keys, including prototype names, are not shortcuts", () => {
    expect(shortcutFor("x", false)).toBeNull();
    expect(shortcutFor("T", true)).toBeNull();
    expect(shortcutFor("constructor", false)).toBeNull();
  });
});
