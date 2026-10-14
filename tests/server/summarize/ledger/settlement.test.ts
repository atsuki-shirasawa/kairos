import { describe, expect, test } from "bun:test";
import {
  type CloseEvent,
  settlementOf,
} from "../../../../src/server/summarize/ledger/settlement.ts";
import { joinCloseNotes } from "../../../../src/shared/closeNotes.ts";

const ev = (ref: string, ts: number, sessionId = "s1"): CloseEvent => ({
  ref,
  ts,
  sessionId,
  note: `${ref}@${ts}`,
});

describe("settlementOf", () => {
  test("settles with the earliest event per ref after the item opened", () => {
    const events = [ev("#1", 50), ev("#1", 300), ev("#1", 200)];
    expect(settlementOf({ refs: ["#1"], openedAt: 100 }, events)).toEqual({
      last: events[2] as CloseEvent,
      note: "#1@200",
    });
  });

  test("ignores events at or before the item opened", () => {
    expect(settlementOf({ refs: ["#1"], openedAt: 100 }, [ev("#1", 100), ev("#1", 90)])).toBeNull();
  });

  test("needs every closable ref settled", () => {
    const item = { refs: ["#1", "task:2"], openedAt: 0 };
    expect(settlementOf(item, [ev("#1", 10)])).toBeNull();
    expect(settlementOf(item, [ev("#1", 10), ev("task:2", 20)])).not.toBeNull();
  });

  test("the last ref settled gives the time and session; notes join in ref order", () => {
    const item = { refs: ["task:2", "#1"], openedAt: 0 };
    const events = [ev("#1", 30, "later"), ev("task:2", 20, "earlier")];
    expect(settlementOf(item, events)).toEqual({
      last: events[0] as CloseEvent,
      note: joinCloseNotes(["task:2@20", "#1@30"]),
    });
  });

  test("on a tie, the first listed event wins, both per ref and for the last", () => {
    const a = ev("#1", 10, "a");
    const b = ev("#1", 10, "b");
    expect(settlementOf({ refs: ["#1"], openedAt: 0 }, [a, b])?.last).toBe(a);
    const c = ev("#2", 10, "c");
    expect(settlementOf({ refs: ["#1", "#2"], openedAt: 0 }, [a, c])?.last).toBe(a);
  });

  test("Jira keys neither hold an item open nor settle it", () => {
    expect(settlementOf({ refs: ["PROJ-7", "#1"], openedAt: 0 }, [ev("#1", 5)])?.note).toBe("#1@5");
    expect(settlementOf({ refs: ["PROJ-7"], openedAt: 0 }, [ev("PROJ-7", 5)])).toBeNull();
  });
});
