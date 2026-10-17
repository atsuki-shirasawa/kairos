import { expect, test } from "bun:test";
import { printableLine } from "../../src/shared/text.ts";

test("printableLine strips control characters that could drive the terminal", () => {
  expect(printableLine("a\x1b]52;c;ZXZpbA==\x07b\n\n  c")).toBe("a ]52;c;ZXZpbA== b c");
});
