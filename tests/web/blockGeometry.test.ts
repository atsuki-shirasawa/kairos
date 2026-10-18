import { describe, expect, test } from "bun:test";
import { blockGeometry, RAISED_LAYER, stackOrder } from "../../src/web/src/lib/blockGeometry.ts";
import { layoutDay, type PlacedBlock } from "../../src/web/src/lib/layout.ts";
import { DAY0, H, session as sessionOf } from "./helpers.ts";

/** A finished session with one block per [start, end] span. */
const session = (id: string, spans: [number, number][]) => sessionOf(id, ...spans);

/** The only block a single-span session lays out on DAY0. */
function placed(start: number, end: number): PlacedBlock {
  const [block] = layoutDay([session("s", [[DAY0 + start * H, DAY0 + end * H]])], DAY0);
  if (!block) throw new Error("no block laid out");
  return block;
}

describe("blockGeometry", () => {
  test("a long block is filled over its full height", () => {
    const geo = blockGeometry(placed(9, 11), 50);
    expect(geo).toEqual({
      top: 9 * 50 + 1,
      height: 100 - 2,
      filledPx: 100 - 2,
      stretched: false,
      short: false,
      visible: 98,
      lines: 3,
    });
  });

  test("a short block is stretched to the minimum, filled only over its real length", () => {
    const geo = blockGeometry(placed(9, 9 + 12 / 60), 48);
    expect(geo.height).toBeCloseTo((25 / 60) * 48 - 2);
    expect(geo.filledPx).toBeCloseTo(0.2 * 48 - 2);
    expect(geo.stretched).toBe(true);
    expect(geo.short).toBe(true);
    expect(geo.lines).toBe(1);
  });

  test("a covered block fits its heading above the block on top", () => {
    const geo = blockGeometry({ ...placed(9, 12), coveredFrom: 9.5 * H }, 50);
    expect(geo.visible).toBe(25);
    expect(geo.lines).toBe(1);
  });
});

describe("stackOrder", () => {
  const order = (depth: number, selected = false, muted = false) =>
    stackOrder({ depth, selected, muted });

  test("draws deeper blocks on top, and a selected block never over the ones stacked on it", () => {
    expect(order(1)).toBeGreaterThan(order(0));
    expect(order(0, true)).toBeGreaterThan(order(0));
    expect(order(0, true)).toBeLessThan(order(1));
  });

  test("puts every block in full view above every faded one", () => {
    expect(order(0)).toBeGreaterThan(order(20, false, true));
    expect(order(2, false, true)).toBeGreaterThan(order(1, false, true));
  });

  test("brings a hovered or focused faded block back above the blocks in full view", () => {
    expect(RAISED_LAYER + order(0, false, true)).toBeGreaterThan(order(20, true));
  });
});
