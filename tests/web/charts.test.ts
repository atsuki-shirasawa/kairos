import { describe, expect, test } from "bun:test";
import { hourAxis, scaleToMax, scaleToSum } from "../../src/web/src/lib/charts.ts";

const H = 3_600_000;

describe("scaling", () => {
  test("scales to the largest value", () => {
    const scale = scaleToMax([2, 4]);
    expect(scale(2)).toBe(50);
    expect(scale(4)).toBe(100);
  });

  test("an all-zero chart draws empty bars", () => {
    expect(scaleToMax([0, 0])(0)).toBe(0);
    expect(scaleToMax([])(0)).toBe(0);
  });

  test("splits a stack by share, and an empty stack doesn't divide by zero", () => {
    expect(scaleToSum([1, 3])(1)).toBe(25);
    expect(scaleToSum([])(0)).toBe(0);
  });
});

describe("hourAxis", () => {
  test("widens to whole hours and places times along it", () => {
    const axis = hourAxis([
      { start: 9.5 * H, end: 10 * H },
      { start: 11 * H, end: 12.25 * H },
    ]);
    expect(axis?.hours).toEqual([9, 10, 11, 12, 13]);
    expect(axis?.at(9 * H)).toBe(0);
    expect(axis?.at(11 * H)).toBe(50);
    expect(axis?.at(13 * H)).toBe(100);
  });

  test("spans at least an hour", () => {
    const axis = hourAxis([{ start: 9 * H, end: 9 * H }]);
    expect(axis?.hours).toEqual([9, 10]);
  });

  test("is null without blocks", () => {
    expect(hourAxis([])).toBeNull();
  });
});
