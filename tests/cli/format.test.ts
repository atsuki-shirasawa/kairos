import { expect, test } from "bun:test";
import { oneLine, parseDay, startOfDay, uiLink } from "../../src/cli/format.ts";

const NOW = new Date(2026, 9, 13, 15, 30).getTime();

test("parseDay reads today, yesterday and real calendar dates only", () => {
  expect(parseDay("today", NOW)).toBe(new Date(2026, 9, 13).getTime());
  expect(parseDay("yesterday", NOW)).toBe(new Date(2026, 9, 12).getTime());
  expect(parseDay("2026-01-31")).toBe(new Date(2026, 0, 31).getTime());
  for (const bad of ["2026-02-30", "2026-13-01", "2026-1-5", "tomorrow", ""])
    expect(parseDay(bad, NOW)).toBeNull();
});

test("startOfDay moves by calendar days, across month ends", () => {
  expect(startOfDay(NOW, 1)).toBe(new Date(2026, 9, 14).getTime());
  expect(startOfDay(new Date(2026, 0, 31, 23).getTime(), 1)).toBe(new Date(2026, 1, 1).getTime());
});

test("uiLink opens a day in the day view, and a session's drawer at a block", () => {
  const base = "http://127.0.0.1:4319/";
  expect(uiLink(base)).toBe(base);
  expect(uiLink(base, { day: new Date(2026, 9, 1).getTime() })).toBe(
    `${base}?view=day&date=2026-10-01`,
  );
  expect(uiLink(base, { session: "abc", start: 42 })).toBe(`${base}?session=abc&at=42`);
});

test("oneLine strips control characters that could drive the terminal", () => {
  expect(oneLine("a\x1b]52;c;ZXZpbA==\x07b\n\n  c")).toBe("a ]52;c;ZXZpbA== b c");
});
