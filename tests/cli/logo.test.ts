import { expect, test } from "bun:test";
import { DUSK, logoLines } from "../../src/cli/logo.ts";

test("the logo is six rows of twelve cells, drawn with half blocks", () => {
  const lines = logoLines(false);
  expect(lines).toHaveLength(6);
  for (const line of lines) expect(line).toHaveLength(12);
  expect(lines.join("")).toMatch(/^[ █▀▄]+$/);
});

test("in color each cell carries the favicon's exact colors", () => {
  const text = logoLines(true).join("\n");
  expect(text).toContain("\x1b[38;2;");
  expect(text).toContain("\x1b[48;2;");
  expect(DUSK).toEqual([0xef, 0xc9, 0x8a]);
});
