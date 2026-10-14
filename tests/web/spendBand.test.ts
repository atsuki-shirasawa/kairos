import { describe, expect, test } from "bun:test";
import { SPEND_BUCKET_MS } from "../../src/shared/constants.ts";
import {
  hourTicks,
  SPAN_MS,
  spendBarSpeech,
  spendBars,
  visibleTicks,
} from "../../src/web/src/lib/spendBand.ts";

const NOW = 1_000_000_000;

describe("spend band", () => {
  test("hour ticks fall on whole hours strictly inside the span", () => {
    const at = (h: number, min = 0) => new Date(2026, 9, 14, h, min).getTime();
    expect(hourTicks(at(8, 53), at(11, 53))).toEqual([at(9), at(10), at(11)]);
    expect(hourTicks(at(9), at(12))).toEqual([at(10), at(11)]);
  });

  test("spend bars are scaled against the tallest, with empty bars kept in place", () => {
    const bars = spendBars(
      {
        from: NOW,
        buckets: [
          [
            { projectId: 1, usd: 3 },
            { projectId: 2, usd: 1 },
          ],
          [],
          [{ projectId: 1, usd: 2 }],
        ],
      },
      600_000,
    );
    expect(bars.map((b) => b.start)).toEqual([NOW, NOW + 600_000, NOW + 1_200_000]);
    expect(bars.map((b) => b.total)).toEqual([4, 0, 2]);
    expect(bars.map((b) => b.height)).toEqual([1, 0, 0.5]);
    expect(bars[0]?.segments.map((x) => x.share)).toEqual([0.75, 0.25]);
    expect(bars[2]?.segments[0]?.share).toBe(0.5);
    // Nothing spent: no bar divides by zero
    expect(spendBars({ from: NOW, buckets: [[]] }, 600_000)[0]?.segments).toEqual([]);
  });

  test("the axis leaves out hours crowding the left end or Now", () => {
    const at = (h: number, min = 0) => new Date(2026, 9, 14, h, min).getTime();
    const from = at(8, 53);
    const ticks = (nowAt: number) => visibleTicks(from, nowAt).map((x) => x.t);
    // 9:00 sits 7 minutes in, too close to the left end
    expect(ticks(1)).toEqual([at(10), at(11)]);
    // Now a few minutes before 11:00 hides it
    expect(ticks((at(10, 55) - from) / SPAN_MS)).toEqual([at(10)]);
    expect(visibleTicks(at(8, 0), 1)[0]?.at).toBeCloseTo(1 / 3);
  });

  test("a bar reads its slot and total, then each project", () => {
    const [bar] = spendBars(
      { from: NOW, buckets: [[{ projectId: 1, usd: 0.5 }]] },
      SPEND_BUCKET_MS,
    );
    if (!bar) throw new Error("no bar");
    expect(spendBarSpeech(bar, () => "kairos")).toMatch(/^\S+–\S+ \S+: kairos \S+$/);
  });
});
