import { describe, expect, test } from "bun:test";
import {
  MAX_CANDIDATES,
  pickCandidates,
} from "../../../../src/server/summarize/ledger/candidates.ts";
import type { LedgerItem } from "../../../../src/server/summarize/ledger/items.ts";
import { DAY } from "../../../../src/shared/dates.ts";

const START = 30 * DAY;

const item = (id: number, sessionId: string, refs: string[] = [], openedAt = START - DAY) =>
  ({ id, sessionId, refs, openedAt }) as LedgerItem;

const ids = (items: LedgerItem[]) => items.map((i) => i.id);

const scope = { chain: ["s", "s0"], sectionRefs: ["#21", "task:1"], start: START };

describe("pickCandidates", () => {
  test("puts the chain's items and those naming the section's refs before the untied ones", () => {
    const earlier = [item(1, "x"), item(2, "s", ["#9"]), item(3, "y", ["#21"]), item(4, "s0")];
    expect(ids(pickCandidates(earlier, scope))).toEqual([2, 3, 4, 1]);
  });

  test("another session's item naming another ref isn't offered; one naming only a task is", () => {
    // A task ID means nothing outside its chain, so it doesn't tie the item to this section
    const earlier = [item(1, "x", ["#9"]), item(2, "x", ["task:1"]), item(3, "x", ["APP-3"])];
    expect(ids(pickCandidates(earlier, scope))).toEqual([2]);
  });

  test("offers untied items opened within a week of the section's start", () => {
    const earlier = [item(1, "x", [], START - 7 * DAY), item(2, "x", [], START - 7 * DAY - 1)];
    expect(ids(pickCandidates(earlier, scope))).toEqual([1]);
    // Tied items have no window
    expect(ids(pickCandidates([item(3, "s", [], 0)], scope))).toEqual([3]);
  });

  test("keeps at most MAX_CANDIDATES, the tied ones first", () => {
    const untied = Array.from({ length: MAX_CANDIDATES }, (_, n) => item(100 + n, "x"));
    const picked = pickCandidates([...untied, item(1, "s")], scope);
    expect(picked).toHaveLength(MAX_CANDIDATES);
    expect(picked[0]?.id).toBe(1);
  });
});
