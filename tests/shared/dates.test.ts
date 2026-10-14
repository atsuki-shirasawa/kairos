import { expect, test } from "bun:test";
import { hhmm, isoDay, startOfDay } from "../../src/shared/dates.ts";

const NOW = new Date(2026, 9, 13, 15, 30).getTime();

test("startOfDay gives local midnight, moved by calendar days across month ends", () => {
  expect(startOfDay(NOW)).toBe(new Date(2026, 9, 13).getTime());
  expect(startOfDay(NOW, 1)).toBe(new Date(2026, 9, 14).getTime());
  expect(startOfDay(NOW, -13)).toBe(new Date(2026, 8, 30).getTime());
  expect(startOfDay(new Date(2026, 0, 31, 23).getTime(), 1)).toBe(new Date(2026, 1, 1).getTime());
});

test("isoDay pads the month and day in local time", () => {
  expect(isoDay(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
  expect(isoDay(NOW)).toBe("2026-10-13");
});

test("hhmm pads the hour and minute in local time", () => {
  expect(hhmm(new Date(2026, 0, 5, 9, 4).getTime())).toBe("09:04");
  expect(hhmm(NOW)).toBe("15:30");
});
