import { describe, expect, test } from "bun:test";
import { blockContent, META_MIN_PX } from "../../src/web/src/lib/blockContent.ts";
import type { BlockGeometry } from "../../src/web/src/lib/blockGeometry.ts";

/** An uncovered block `px` tall, with the heading lines that fit. */
const geo = (px: number, lines = 3): BlockGeometry => ({
  top: 0,
  height: px,
  filledPx: px,
  stretched: false,
  short: px < 34,
  visible: px,
  lines,
});

describe("blockContent", () => {
  test("a block shows only its heading, in the lines that fit", () => {
    expect(blockContent(geo(200), { selected: false })).toEqual({ meta: false, lines: 3 });
  });

  test("a selected block tall enough gets the time range, and the heading the lines left", () => {
    const content = blockContent(geo(META_MIN_PX), { selected: true });
    expect(content.meta).toBe(true);
    expect(content.lines).toBe(1);
  });

  test("a short block keeps one line", () => {
    expect(blockContent(geo(30, 1), { selected: true }).lines).toBe(1);
  });
});
