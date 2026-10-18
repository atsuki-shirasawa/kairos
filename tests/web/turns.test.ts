import { describe, expect, test } from "bun:test";
import type { TurnSpan } from "../../src/shared/api.ts";
import { blocksOfDay } from "../../src/web/src/lib/dayBlocks.ts";
import { turnShares } from "../../src/web/src/lib/turns.ts";
import { at, DAY0, H, session } from "./helpers.ts";

/** The day's one block, from `start` to `end` hours after DAY0, with these turns. */
function block(start: number, end: number, turns: TurnSpan[], day = DAY0) {
  const s = session("s", [at(start), at(end)]);
  (s.segments[0] as (typeof s.segments)[number]).turns = turns;
  return blocksOfDay([s], day)[0] as ReturnType<typeof blocksOfDay>[number];
}

describe("turnShares", () => {
  test("cuts the block into shares of its length, leaving what can't be told empty", () => {
    const shares = turnShares(
      block(9, 13, [
        { start: at(9), end: at(11), who: "claude" },
        { start: at(11), end: at(12), who: "you" },
      ]),
    );
    expect(shares).toEqual({
      pieces: [
        { who: "claude", from: 0, to: 0.5 },
        { who: "you", from: 0.5, to: 0.75 },
      ],
      claudeMs: 2 * H,
      youMs: H,
    });
  });

  test("a block crossing midnight shows only this day's part of its turns", () => {
    const turns: TurnSpan[] = [{ start: at(22), end: at(26), who: "claude" }];
    const next = turnShares(block(22, 26, turns, DAY0 + 24 * H));
    expect(next?.pieces).toEqual([{ who: "claude", from: 0, to: 1 }]);
    expect(next?.claudeMs).toBe(2 * H);
  });

  test("nothing for a block without turns", () => {
    expect(turnShares(block(9, 10, []))).toBeNull();
  });
});
