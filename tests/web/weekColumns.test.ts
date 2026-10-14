import { describe, expect, test } from "bun:test";
import { columnTracks, focusDayIndex } from "../../src/web/src/lib/weekColumns.ts";
import { DAY0, H, session as sessionOf } from "./helpers.ts";

const DAY1 = new Date(2026, 9, 6).getTime();

/** A finished session with one block per [start, end] span. */
const session = (id: string, spans: [number, number][]) => sessionOf(id, ...spans);

describe("columnTracks", () => {
  const fr = (track: string) => Number(/([\d.]+)fr\)$/.exec(track)?.[1]);

  test("all days even when there is no work", () => {
    expect(columnTracks([0, 0, 0], 700, -1)).toEqual(Array(3).fill("minmax(0, 1fr)"));
  });

  test("days with parallel work get more width; days without work stay narrow", () => {
    const tracks = columnTracks([1, 4, 0], 2000, -1);
    expect(fr(tracks[1] ?? "")).toBeGreaterThan(fr(tracks[0] ?? ""));
    expect(tracks[2]).toBe("minmax(2.5rem, 0.15fr)");
  });

  test("with lanes too narrow, the selected day and its neighbors keep their width", () => {
    const wide = columnTracks([2, 4, 2, 1, 1, 1, 1], 3000, 1);
    expect(wide.every((t) => t.startsWith("minmax(0,"))).toBe(true);
    const narrow = columnTracks([2, 4, 2, 1, 1, 1, 1], 900, 1);
    expect(narrow[1]).toBe("minmax(0, 2.5fr)");
    expect(fr(narrow[0] ?? "")).toBeLessThan(fr(wide[0] ?? ""));
    expect(narrow.slice(3)).toEqual(Array(4).fill("minmax(2.5rem, 0.25fr)"));
  });

  test("without a selection, narrow lanes leave the weights as they are", () => {
    expect(columnTracks([2, 4, 2, 1, 1, 1, 1], 900, -1)).toEqual(
      columnTracks([2, 4, 2, 1, 1, 1, 1], 3000, -1),
    );
  });
});

describe("focusDayIndex", () => {
  const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 5 + i).getTime());
  const sessions = [session("a", [[DAY1 + 10 * H, DAY1 + 11 * H]])];

  test("the day of the selected block", () => {
    expect(focusDayIndex(sessions, "a", null, week)).toBe(1);
  });

  test("a block started before the period belongs to the first day", () => {
    const early = [session("b", [[DAY0 - 2 * H, DAY0 + H]])];
    expect(focusDayIndex(early, "b", null, week)).toBe(0);
  });

  test("none without a selection, or with few days", () => {
    expect(focusDayIndex(sessions, null, null, week)).toBe(-1);
    expect(focusDayIndex(sessions, "a", null, week.slice(0, 3))).toBe(-1);
  });
});
