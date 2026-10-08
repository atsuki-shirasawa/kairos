import { expect, test } from "bun:test";
import { type BarState, formatDuration, renderBar, StatusBar } from "../../src/cli/progress.ts";

const state: BarState = {
  done: 37,
  total: 225,
  failed: 1,
  elapsedMs: 37 * 9000,
  current: "2026-09-21 14:02  kairos",
  frame: 3,
};

test("durations read as hours, minutes or seconds", () => {
  expect(formatDuration(45_000)).toBe("45s");
  expect(formatDuration(12 * 60_000 + 30_000)).toBe("12m 30s");
  expect(formatDuration(65 * 60_000)).toBe("1h 05m");
});

test("the bar shows the count, percent, failures, time left and the current block", () => {
  const line = renderBar(state, 120, false);
  for (const part of ["37/225", "16%", "1 failed", "~28m 12s left", "2026-09-21 14:02  kairos"])
    expect(line).toContain(part);
});

test("the bar never wraps, dropping the least useful parts first on narrow terminals", () => {
  for (const color of [false, true])
    for (let columns = 30; columns <= 120; columns++)
      expect(Bun.stringWidth(renderBar(state, columns, color))).toBeLessThan(columns);
  expect(renderBar(state, 50, false)).toContain("left");
  expect(renderBar(state, 50, false)).not.toContain("kairos");
  expect(renderBar(state, 30, false)).toContain("37/225");
});

test("no time left before the first block finishes, and a check mark at the end", () => {
  expect(renderBar({ ...state, done: 0 }, 120, false)).not.toContain("left");
  expect(renderBar({ ...state, done: 225 }, 120, false)).toStartWith("✓");
});

test("off a terminal it draws nothing and logs plain lines", () => {
  const written: string[] = [];
  const bar = new StatusBar({ isTTY: false, write: (t: string) => written.push(t) }, 2, false);
  bar.begin("a");
  bar.log("line 1");
  bar.advance(false);
  bar.close();
  expect(written).toEqual(["line 1\n"]);
});

test("on a terminal each log line clears the bar and the bar is redrawn below it", () => {
  const written: string[] = [];
  const bar = new StatusBar(
    { isTTY: true, columns: 100, write: (t: string) => written.push(t) },
    2,
    false,
  );
  bar.log("line 1");
  bar.close();
  expect(written[0]).toBe("\r\x1b[2Kline 1\n");
  expect(written[1]).toContain("0/2");
  expect(written.at(-1)).toBe("\r\x1b[2K");
});
