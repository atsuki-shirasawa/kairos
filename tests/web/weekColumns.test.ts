import { describe, expect, test } from "bun:test";
import { columnTracks } from "../../src/web/src/lib/weekColumns.ts";

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
