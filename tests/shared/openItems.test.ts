import { expect, test } from "bun:test";
import { closedByHand, closedUndone, isHandClose, isOpenAt } from "../../src/shared/openItems.ts";

test("isOpenAt counts an item closed at or after the time as still open", () => {
  expect(isOpenAt({ closedAt: null, closedBy: null }, 100)).toBe(true);
  expect(isOpenAt({ closedAt: 100, closedBy: "ref" }, 100)).toBe(true);
  expect(isOpenAt({ closedAt: 150, closedBy: "dismissed" }, 100)).toBe(true);
  expect(isOpenAt({ closedAt: 99, closedBy: "user" }, 100)).toBe(false);
});

test("isOpenAt never counts an item the summary listed by mistake as open, even before the click", () => {
  expect(isOpenAt({ closedAt: 150, closedBy: "mistaken" }, 100)).toBe(false);
});

test("isHandClose accepts the three hand closes and nothing else", () => {
  expect(["done", "dismissed", "mistaken"].every(isHandClose)).toBe(true);
  for (const v of ["open", "user", "toString", "", null, 1]) expect(isHandClose(v)).toBe(false);
});

test("closedByHand tells a hand close from one the log or a summary made", () => {
  expect(closedByHand("user")).toBe(true);
  expect(closedByHand("dismissed")).toBe(true);
  expect(closedByHand("mistaken")).toBe(true);
  expect(closedByHand("ref")).toBe(false);
  expect(closedByHand("model")).toBe(false);
  expect(closedByHand(null)).toBe(false);
});

test("closedUndone is true only for items set aside or never open", () => {
  expect(closedUndone("dismissed")).toBe(true);
  expect(closedUndone("mistaken")).toBe(true);
  expect(closedUndone("user")).toBe(false);
  expect(closedUndone("ref")).toBe(false);
});
