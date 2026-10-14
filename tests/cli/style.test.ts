import { expect, test } from "bun:test";
import {
  CLEAR_LINE,
  RESET,
  rgbBg,
  rgbFg,
  rgbOnPalette,
  styles,
  wrapWords,
} from "../../src/cli/style.ts";

test("wrapWords breaks at spaces only, giving an overlong word its own line", () => {
  expect(wrapWords("one two three four", 9)).toEqual(["one two", "three", "four"]);
  expect(wrapWords("see /a/very/long/path here", 8)).toEqual(["see", "/a/very/long/path", "here"]);
  expect(wrapWords("keep these together", 12)).toEqual(["keep these", "together"]);
});

test("styles are the identity without color", () => {
  const s = styles(false);
  for (const style of Object.values(s)) expect(style("x")).toBe("x");
  expect(styles(true).heading("x")).toBe("\x1b[1mx\x1b[0m");
});

test("exact colors and line control go through named escapes", () => {
  expect(rgbFg([1, 2, 3])).toBe("\x1b[38;2;1;2;3m");
  expect(rgbBg([1, 2, 3])).toBe("\x1b[48;2;1;2;3m");
  expect(rgbOnPalette([1, 2, 3], 236)).toBe("\x1b[38;2;1;2;3;48;5;236m");
  expect(RESET).toBe("\x1b[0m");
  expect(CLEAR_LINE).toBe("\r\x1b[2K");
});
