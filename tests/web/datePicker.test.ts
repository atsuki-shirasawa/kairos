import { describe, expect, test } from "bun:test";
import { dayCellState, movedCursor } from "../../src/web/src/lib/datePicker.ts";
import { addDays, addMonths } from "../../src/web/src/lib/dates.ts";
import { DAY0 } from "./helpers.ts";

describe("movedCursor", () => {
  test("arrows move by a day or a week, PageUp / PageDown by a month", () => {
    expect(movedCursor("ArrowRight", DAY0)).toBe(addDays(DAY0, 1));
    expect(movedCursor("ArrowUp", DAY0)).toBe(addDays(DAY0, -7));
    expect(movedCursor("PageDown", DAY0)).toBe(addMonths(DAY0, 1));
  });

  test("other keys leave the cursor alone", () => {
    expect(movedCursor("Enter", DAY0)).toBeNull();
  });
});

describe("dayCellState", () => {
  // The week of Sun 2026-10-04 to Sat 2026-10-10 is shown; DAY0 is its Monday
  const sunday = addDays(DAY0, -1);
  const context = {
    month: DAY0,
    from: sunday,
    to: addDays(sunday, 7),
    cursor: DAY0,
    now: addDays(DAY0, 2),
    recorded: new Set([DAY0]),
  };

  test("the shown week is one band, rounded at the row's ends", () => {
    expect(dayCellState(sunday, 0, context)).toMatchObject({
      inRange: true,
      bandStart: true,
      bandEnd: false,
    });
    expect(dayCellState(addDays(sunday, 6), 6, context)).toMatchObject({ bandEnd: true });
    expect(dayCellState(addDays(sunday, 7), 0, context).inRange).toBe(false);
  });

  test("a day period's band is rounded on both sides of its day", () => {
    const day = { ...context, from: DAY0, to: addDays(DAY0, 1) };
    expect(dayCellState(DAY0, 1, day)).toMatchObject({ bandStart: true, bandEnd: true });
  });

  test("marks the cursor, today, recorded days and days of other months", () => {
    expect(dayCellState(DAY0, 1, context)).toMatchObject({ cursor: true, recorded: true });
    expect(dayCellState(addDays(DAY0, 2), 3, context).today).toBe(true);
    expect(dayCellState(new Date(2026, 8, 30).getTime(), 3, context).outside).toBe(true);
  });
});
