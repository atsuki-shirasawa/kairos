import { expect, test } from "bun:test";
import { isOpenAt } from "../../src/shared/openItems.ts";

test("isOpenAt counts an item closed at or after the time as still open", () => {
  expect(isOpenAt({ closedAt: null }, 100)).toBe(true);
  expect(isOpenAt({ closedAt: 100 }, 100)).toBe(true);
  expect(isOpenAt({ closedAt: 150 }, 100)).toBe(true);
  expect(isOpenAt({ closedAt: 99 }, 100)).toBe(false);
});
