import { describe, expect, test } from "bun:test";
import { TOKEN_BUCKET_MS } from "../../src/shared/constants.ts";
import {
  axisTicks,
  labelPositions,
  layerPaths,
  MIN_SPAN_MS,
  slotAtShare,
  slotBox,
  slotHeading,
  slotSpeech,
  tokenChart,
  tokenY,
} from "../../src/web/src/lib/tokenChart.ts";

const at = (h: number, min = 0) => new Date(2026, 9, 14, h, min).getTime();
const MIDNIGHT = at(0);

/** Buckets from midnight up to `now`, with `used` placed in the buckets holding those times. */
function buckets(now: number, used: [number, number | null, number][]) {
  const list: { projectId: number | null; tokens: number }[][] = Array.from(
    { length: Math.max(1, Math.ceil((now - MIDNIGHT) / TOKEN_BUCKET_MS)) },
    () => [],
  );
  for (const [t, projectId, tokens] of used) {
    list[Math.floor((t - MIDNIGHT) / TOKEN_BUCKET_MS)]?.push({ projectId, tokens });
  }
  return { from: MIDNIGHT, to: now, buckets: list };
}

describe("tokenChart", () => {
  test("starts on the hour of the day's first use and adds up each project", () => {
    const now = at(15, 12);
    const chart = tokenChart(
      buckets(now, [
        [at(9, 41), 1, 1],
        [at(11, 2), 2, 3],
        [at(14, 30), 1, 0.5],
      ]),
    );
    expect(chart.start).toBe(at(9));
    expect(chart.end).toBe(now);
    expect(chart.times[0]).toBe(at(9));
    // The last edge is now, inside the slot in progress
    expect(chart.times.at(-1)).toBe(now);
    expect(chart.times).toHaveLength(chart.slots.length + 1);
    expect(chart.total).toBe(4.5);
    // Largest first, so it is drawn at the bottom
    expect(chart.layers.map((l) => [l.projectId, l.total])).toEqual([
      [2, 3],
      [1, 1.5],
    ]);
    expect(chart.layers[1]?.cumulative[0]).toBe(0);
  });

  test("spans at least the last three hours, but not before midnight", () => {
    const earliest = new Date(at(15, 12) - MIN_SPAN_MS).setMinutes(0, 0, 0);
    expect(tokenChart(buckets(at(15, 12), [[at(14, 0), 1, 1]])).start).toBe(earliest);
    expect(tokenChart(buckets(at(15, 12), [])).start).toBe(earliest);
    expect(tokenChart(buckets(at(1, 20), [])).start).toBe(MIDNIGHT);
  });
});

describe("axisTicks", () => {
  test("labels every hour on a short span, leaving out those crowding either end", () => {
    const ticks = axisTicks(at(12), at(15, 3)).map((x) => x.t);
    // 15:00 sits next to Now
    expect(ticks).toEqual([at(13), at(14)]);
  });

  test("labels fewer hours as the day grows", () => {
    const ticks = axisTicks(at(6), at(20)).map((x) => new Date(x.t).getHours());
    expect(ticks).toEqual([9, 12, 15, 18]);
  });
});

describe("labelPositions", () => {
  test("puts each label at the middle of its band's end", () => {
    expect(
      labelPositions(
        [
          { bottom: 0, top: 50 },
          { bottom: 50, top: 100 },
        ],
        100,
        100,
        10,
      ),
    ).toEqual([75, 25]);
  });

  test("pushes thin bands' labels apart within the height", () => {
    const ys = labelPositions(
      [
        { bottom: 0, top: 98 },
        { bottom: 98, top: 99 },
        { bottom: 99, top: 100 },
      ],
      100,
      100,
      20,
    );
    expect(ys[2]).toBe(10);
    expect(ys[1]).toBe(30);
    expect((ys[0] ?? 0) - (ys[1] ?? 0)).toBeGreaterThanOrEqual(20);
  });

  test("leaves the smallest bands without a label when they don't fit", () => {
    const bands = Array.from({ length: 6 }, (_, i) => ({ bottom: i, top: i + 1 }));
    const ys = labelPositions(bands, 6, 40, 20);
    expect(ys.filter((y) => y !== null)).toHaveLength(2);
    expect(ys.slice(2)).toEqual([null, null, null, null]);
  });
});

describe("layerPaths", () => {
  test("stacks each band on the ones below it and ends at the chart's total", () => {
    const chart = tokenChart(
      buckets(at(15, 0), [
        [at(13, 0), 1, 2],
        [at(14, 0), 2, 2],
      ]),
    );
    const [first, second] = layerPaths(chart, 100, 100);
    expect(first?.end).toEqual({ bottom: 0, top: 2 });
    expect(second?.end).toEqual({ bottom: 2, top: 4 });
    // The top edge ends at the right end, at the full height
    expect(second?.edge.endsWith("100.00,0.00")).toBe(true);
  });

  test("draws nothing used on the floor", () => {
    const chart = tokenChart(buckets(at(15, 0), []));
    expect(layerPaths(chart, 100, 100)).toEqual([]);
    expect(chart.total).toBe(0);
  });
});

describe("slots", () => {
  const now = at(15, 7);
  const chart = tokenChart(
    buckets(now, [
      [at(13, 2), 1, 50_000],
      // Largest first within a slot, as the server sends it
      [at(15, 6), 2, 500_000],
      [at(15, 6), 1, 250_000],
    ]),
  );

  test("a slot reads its time range and what it added, the one in progress ending now", () => {
    const first = slotAtShare(chart, 0);
    if (first === null) throw new Error("no slot");
    expect(slotHeading(chart, chart.times.indexOf(at(13)))).toBe("13:00–13:05 +50.0k");
    const last = chart.times.length - 2;
    expect(slotHeading(chart, last)).toBe("15:05–15:07 +750k");
    expect(slotSpeech(chart, last, (id) => `p${id}`)).toBe("15:05–15:07 +750k: p2 500k, p1 250k");
  });

  test("a point on the chart picks the slot under it, the right end the slot in progress", () => {
    expect(slotAtShare(chart, 0)).toBe(0);
    expect(slotAtShare(chart, 1)).toBe(chart.times.length - 2);
    expect(slotAtShare(chart, -0.1)).toBeNull();
  });

  test("a slot's box spans its share of the width", () => {
    const span = chart.end - chart.start;
    expect(slotBox(chart, 0)).toEqual({ left: 0, width: TOKEN_BUCKET_MS / span });
    expect(slotBox(chart, chart.times.length - 1)).toBeNull();
    expect(slotBox(chart, -1)).toBeNull();
  });
});

test("tokens map onto the height, with nothing used on the floor", () => {
  expect(tokenY(4, 100)(1)).toBe(75);
  expect(tokenY(4, 100)(4)).toBe(0);
  expect(tokenY(0, 100)(0)).toBe(100);
});
