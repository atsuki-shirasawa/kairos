import { describe, expect, test } from "bun:test";
import type { LedgerEntry } from "../../src/shared/api.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import {
  spanLabel,
  threadDays,
  threadGoal,
  threadItems,
  threadSpan,
} from "../../src/web/src/lib/thread.ts";
import { at, DAY0, session } from "./helpers.ts";

const DAY = 24 * 3_600_000;

describe("threadGoal", () => {
  test("is the Goal of the earliest block with one, whichever session it is in", () => {
    const later = session("later", [at(10), at(11)]);
    const earlier = session("earlier", [at(8), at(9)], [at(12), at(13)]);
    const [first, second] = earlier.segments;
    if (!first || !second || !later.segments[0]) throw new Error("no segments");
    first.body = "a body written before Goal was a part";
    second.body = "- **Goal**: ship the importer\n- **Done**: wrote it";
    later.segments[0].body = "- Goal: fix the login form\n- Done: fixed it";
    expect(threadGoal([later, earlier])).toBe("fix the login form");
  });

  test("is null while no block has a Goal", () => {
    expect(threadGoal([session("a", [at(1), at(2)])])).toBeNull();
  });
});

describe("threadDays and threadSpan", () => {
  test("list each day a block ran on once, a block past midnight on both", () => {
    const thread = [
      session("a", [at(9), at(10)], [at(23), at(25)]),
      session("b", [at(49), at(50)]),
    ];
    expect(threadDays(thread)).toEqual([DAY0, DAY0 + DAY, DAY0 + 2 * DAY]);
    expect(threadSpan(thread)).toEqual({ from: at(9), to: at(50) });
  });

  test("a thread with no blocks has no days and no span", () => {
    expect(threadDays([session("a")])).toEqual([]);
    expect(threadSpan([session("a")])).toBeNull();
  });
});

test("spanLabel names one day once, and a range by its ends", () => {
  setLocale("en");
  expect(spanLabel({ from: at(9), to: at(10) }, at(9))).toBe("Mon, Oct 5");
  expect(spanLabel({ from: at(9), to: at(33) }, at(9))).toBe("Mon, Oct 5 – Tue, Oct 6");
});

test("threadItems puts the open items apart from those settled since", () => {
  const item = (id: number, closedAt: number | null) => ({ id, closedAt }) as LedgerEntry;
  expect(threadItems([item(1, null), item(2, 5), item(3, null)])).toEqual({
    open: [item(1, null), item(3, null)],
    closed: [item(2, 5)],
  });
});
