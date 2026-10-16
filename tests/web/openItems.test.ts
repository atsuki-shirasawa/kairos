import { describe, expect, test } from "bun:test";
import type { LedgerEntry } from "../../src/shared/api.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import { groupOpenItems, logCloses, weekOpen } from "../../src/web/src/lib/openItems.ts";

const DAY = 24 * 3_600_000;
const FROM = new Date(2026, 9, 5).getTime(); // Mon 2026-10-05
const TO = FROM + 7 * DAY;

let nextId = 1;
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: nextId++,
  projectId: 1,
  kind: "todo",
  text: "x",
  sessionId: "s",
  start: 0,
  openedAt: FROM + DAY,
  closedAt: null,
  closedBy: null,
  closedSessionId: null,
  closedStart: null,
  closedNote: null,
  ...over,
});

describe("weekOpen", () => {
  test("counts from week 1 in the first seven days", () => {
    const item = entry({ openedAt: FROM });
    expect(weekOpen(item, FROM + DAY)).toBe(1);
    expect(weekOpen(item, FROM + 7 * DAY)).toBe(2);
    expect(weekOpen(item, FROM - DAY)).toBe(1);
  });
});

describe("groupOpenItems", () => {
  test("splits open, old and closed per project, the newest first whatever the kind", () => {
    const items = [
      entry({ kind: "todo", text: "older todo", openedAt: FROM }),
      entry({ kind: "todo", text: "newer todo", openedAt: FROM + 2 * DAY }),
      entry({ kind: "waiting", text: "review" }),
      entry({ kind: null, text: "untagged" }),
      entry({ kind: "issue", text: "old", openedAt: FROM - 30 * DAY }),
      entry({ text: "closed later", closedAt: TO + DAY, closedBy: "ref" }),
      entry({ text: "closed first", closedAt: FROM + 2 * DAY, closedBy: "user" }),
      entry({ text: "closed last", closedAt: FROM + 3 * DAY, closedBy: "model" }),
      entry({ projectId: 2, text: "other project" }),
      entry({ projectId: null, text: "no project" }),
    ];
    const groups = groupOpenItems(items, FROM, TO, TO);
    const g = groups.get(1);
    expect(g?.open.map((i) => i.text)).toEqual([
      "newer todo",
      "review",
      "untagged",
      "closed later", // closed after the period, so open at its end
      "older todo",
    ]);
    expect(g?.old.map((i) => i.text)).toEqual(["old"]);
    expect(g?.closed.map((i) => i.text)).toEqual(["closed last", "closed first"]);
    // Everything left open in the period, closed or not
    expect(g?.opened).toBe(7);
    expect(groups.get(2)?.open).toHaveLength(1);
    expect([...groups.keys()]).toEqual([1, 2]);
  });

  test("items left at the same time keep the order their summary listed them in", () => {
    const first = entry({ text: "first" });
    const second = entry({ text: "second" });
    const open = groupOpenItems([second, first], FROM, TO, TO).get(1)?.open;
    expect(open?.map((i) => i.text)).toEqual(["first", "second"]);
  });

  test("an item closed by hand after the period shows as closed in it, so it can be undone", () => {
    const groups = groupOpenItems(
      [
        entry({ text: "dismissed later", closedAt: TO + DAY, closedBy: "dismissed" }),
        entry({ text: "dismissed before", closedAt: FROM - DAY, closedBy: "dismissed" }),
      ],
      FROM,
      TO,
      TO,
    );
    expect(groups.get(1)?.closed.map((i) => i.text)).toEqual(["dismissed later"]);
    expect(groups.get(1)?.open).toEqual([]);
    // Listed so it can be undone, but not counted as closed in the period
    expect(groups.get(1)?.closedIn).toBe(0);
  });

  test("an item turns old once it has been open four full weeks", () => {
    const at = FROM + 28 * DAY;
    const groups = groupOpenItems(
      [
        entry({ text: "27 days", openedAt: at - 27 * DAY }),
        entry({ text: "28 days", openedAt: at - 28 * DAY }),
      ],
      FROM,
      at + DAY,
      at,
    );
    expect(groups.get(1)?.open.map((i) => i.text)).toEqual(["27 days"]);
    expect(groups.get(1)?.old.map((i) => i.text)).toEqual(["28 days"]);
  });
});

describe("logCloses", () => {
  test("puts the server's phrases into words in either language, keeping unknown ones", () => {
    setLocale("en");
    expect(logCloses("closed #21; merged PR #5")).toBe("closed #21, merged PR #5");
    setLocale("ja");
    expect(logCloses("closed #21; task #3 completed; something else")).toBe(
      "#21 をクローズ、タスク #3 を完了、something else",
    );
    expect(logCloses(null)).toBeNull();
    setLocale("en");
  });
});
