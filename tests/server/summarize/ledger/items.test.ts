import { describe, expect, test } from "bun:test";
import { labelCandidates } from "../../../../src/server/summarize/ledger/candidates.ts";
import { CLOSED_BY, isClosedBy, sqlList } from "../../../../src/server/summarize/ledger/closers.ts";
import { entryOf, type ItemRow, itemOf } from "../../../../src/server/summarize/ledger/items.ts";

const row: ItemRow = {
  id: 1,
  project_id: 2,
  session_id: "s",
  start: 10,
  opened_at: 20,
  kind: "todo",
  text: "Add a BOM",
  refs: '["#21","task:1"]',
  closed_at: 30,
  closed_by: "ref",
  closed_session_id: "t",
  closed_start: 25,
  closed_note: "closed #21",
  headline: "CSV export",
};

describe("entryOf / itemOf", () => {
  test("map a row to the API's entry, and the summarizer's item on top of it", () => {
    const entry = entryOf(row);
    expect(entry).toEqual({
      id: 1,
      projectId: 2,
      kind: "todo",
      text: "Add a BOM",
      sessionId: "s",
      start: 10,
      openedAt: 20,
      closedAt: 30,
      closedBy: "ref",
      closedSessionId: "t",
      closedStart: 25,
      closedNote: "closed #21",
    });
    expect(itemOf(row)).toEqual({ ...entry, refs: ["#21", "task:1"], headline: "CSV export" });
  });

  test("drop an unknown kind or closer, and damaged refs", () => {
    const item = itemOf({ ...row, kind: "chore", closed_by: "robot", refs: "[#21" });
    expect(item).toMatchObject({ kind: null, closedBy: null, refs: [] });
  });
});

describe("closers", () => {
  test("tell stored closers from anything else", () => {
    expect(isClosedBy(CLOSED_BY.dismissed)).toBe(true);
    expect(isClosedBy("robot")).toBe(false);
    expect(isClosedBy(null)).toBe(false);
  });

  test("build an SQL list from the constants", () => {
    expect(sqlList([CLOSED_BY.ref, CLOSED_BY.model])).toBe("('ref', 'model')");
  });
});

describe("labelCandidates", () => {
  test("labels candidates in order and says where each came from", () => {
    const item = itemOf(row);
    const others = [
      item,
      { ...item, sessionId: "other" },
      { ...item, sessionId: "other", headline: null },
    ];
    expect(labelCandidates(others, "s").map((c) => [c.label, c.from])).toEqual([
      ["O1", "earlier in this session"],
      ["O2", 'an earlier session ("CSV export")'],
      ["O3", "an earlier session"],
    ]);
  });
});
