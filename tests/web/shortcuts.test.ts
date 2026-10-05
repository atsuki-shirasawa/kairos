import { describe, expect, test } from "bun:test";
import { shortcutFor } from "../../src/web/src/lib/shortcuts.ts";

describe("shortcutFor", () => {
  test("maps the documented keys", () => {
    expect(shortcutFor("ArrowLeft", false)).toBe("prevPeriod");
    expect(shortcutFor("ArrowRight", false)).toBe("nextPeriod");
    expect(shortcutFor("t", false)).toBe("today");
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
