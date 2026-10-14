import { expect, test } from "bun:test";
import { oneLine } from "../../src/server/text.ts";

test("oneLine collapses whitespace and clips with an ellipsis", () => {
  expect(oneLine("  a\n  b ")).toBe("a b");
  expect(oneLine("abcdef", 3)).toBe("abc…");
});
