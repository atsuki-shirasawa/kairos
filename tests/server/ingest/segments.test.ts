import { expect, test } from "bun:test";
import { toSegments } from "../../../src/server/ingest/segments.ts";

test("toSegments splits where the gap is longer than the interval", () => {
  const m = 60_000;
  expect(toSegments([0, 5 * m, 10 * m, 60 * m, 62 * m], 15 * m)).toEqual([
    [0, 10 * m],
    [60 * m, 62 * m],
  ]);
  expect(toSegments([])).toEqual([]);
});
