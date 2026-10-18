import { describe, expect, test } from "bun:test";
import { turnSpans } from "../../../src/server/ingest/turnSpans.ts";
import { MINUTE } from "../../../src/shared/dates.ts";

/** Minute `n` in ms, so the cases read in minutes. */
const m = (n: number) => n * MINUTE;
const GAP = m(15);

/** A turn that ended at minute `end` after `minutes` of work. */
const turn = (end: number, minutes: number) => ({ end: m(end), durationMs: m(minutes) });
/** An AskUserQuestion asked at minute `asked` and answered at `answered`. */
const wait = (asked: number, answered: number) => ({ asked: m(asked), answered: m(answered) });

type Turn = ReturnType<typeof turn>;
type Wait = ReturnType<typeof wait>;

/**
 * The spans as [who, start, end] in minutes, from turns, waits and prompt minutes (and interrupt
 * minutes, if any).
 */
function spans(turns: Turn[], waits: Wait[], prompts: number[], interrupts: number[] = []) {
  return turnSpans(
    { turns, waits, prompts: prompts.map(m), interrupts: interrupts.map(m) },
    GAP,
  ).map((s) => [s.who, s.start / MINUTE, s.end / MINUTE]);
}

describe("turnSpans", () => {
  test("a turn is Claude's, and the gap your next prompt ends is yours", () => {
    expect(spans([turn(3, 3), turn(8, 2)], [], [0, 6])).toEqual([
      ["claude", 0, 3],
      ["you", 3, 6],
      ["claude", 6, 8],
    ]);
  });

  test("waits move a turn's start back, an earlier one coming inside once a later one does", () => {
    // Worked 4 of the 10 minutes from the prompt at 0: waited 1–4 and 6–9
    expect(spans([turn(10, 4)], [wait(1, 4), wait(6, 9)], [0])).toEqual([
      ["claude", 0, 1],
      ["you", 1, 4],
      ["claude", 4, 6],
      ["you", 6, 9],
      ["claude", 9, 10],
    ]);
  });

  test("an earlier turn's wait stays out of the next turn", () => {
    expect(spans([turn(4, 2), turn(9, 3)], [wait(1, 3)], [0, 6])).toEqual([
      ["claude", 0, 1],
      ["you", 1, 3],
      ["claude", 3, 4],
      ["you", 4, 6],
      ["claude", 6, 9],
    ]);
  });

  test("overlapping turns (a background agent's inside the one that started it) are one", () => {
    expect(spans([turn(10, 10), turn(5, 1)], [], [0])).toEqual([["claude", 0, 10]]);
  });

  test("a turn wrapping another counts the inner turn's wait in its own time", () => {
    // The inner turn (prompt at 0, ended at 5) waited 2–4; the outer one ran 0–10 by the clock
    expect(spans([turn(5, 3), turn(10, 10)], [wait(2, 4)], [0])).toEqual([
      ["claude", 0, 2],
      ["you", 2, 4],
      ["claude", 4, 10],
    ]);
  });

  test("a gap the next turn began without you is neither's", () => {
    // A notification at 5 starts the turn ending at 6; your next prompt is at 8
    expect(spans([turn(3, 3), turn(6, 1), turn(9, 1)], [], [0, 8])).toEqual([
      ["claude", 0, 3],
      ["claude", 5, 6],
      ["you", 6, 8],
      ["claude", 8, 9],
    ]);
  });

  test("a gap longer than a work block's is time away", () => {
    expect(spans([turn(3, 3), turn(23, 1)], [], [0, 22])).toEqual([
      ["claude", 0, 3],
      ["claude", 22, 23],
    ]);
  });

  test("a prompt whose turn left no record still ends your gap, and what follows is unknown", () => {
    // The prompt at 5 was interrupted, so no turn_duration was written for it
    expect(spans([turn(3, 3)], [], [0, 5])).toEqual([
      ["claude", 0, 3],
      ["you", 3, 5],
    ]);
  });

  test("a slash command that starts no turn doesn't end your turn; the prompt after it does", () => {
    // /model at 4, then the prompt at 6 that starts the next turn
    expect(spans([turn(3, 3), turn(8, 2)], [], [0, 4, 6])).toEqual([
      ["claude", 0, 3],
      ["you", 3, 6],
      ["claude", 6, 8],
    ]);
  });

  test("after an interrupt, your turn ends at the prompt whose work was cut short", () => {
    // The prompt at 4 was interrupted at 5, leaving no turn record; the prompt at 6 starts anew
    expect(spans([turn(3, 3), turn(8, 2)], [], [0, 4, 6], [5])).toEqual([
      ["claude", 0, 3],
      ["you", 3, 4],
      ["claude", 6, 8],
    ]);
  });

  test("a question left waiting longer than a block's gap is time away", () => {
    expect(spans([turn(30, 5)], [wait(1, 26)], [0])).toEqual([
      ["claude", 0, 1],
      ["claude", 26, 30],
    ]);
  });

  test("no turns, no spans", () => {
    expect(spans([], [], [0])).toEqual([]);
  });
});
