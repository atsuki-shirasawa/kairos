import { expect, test } from "bun:test";
import { optionText, styleFlag, twoColumns } from "../../src/cli/layout.ts";
import { styles, wrapWords } from "../../src/cli/style.ts";

const plain = styles(false);
const row = (name: string, text: string) => ({ name, styled: name, text });

test("names and explanations share two columns, wrapped beside the name", () => {
  const text = twoColumns([row("a", "one two three"), row("long", "four")], 60, wrapWords);
  expect(text).toBe("  a     one two three\n  long  four");
  // Continuation lines line up under the explanation column
  expect(
    twoColumns(
      [row("a", "one two three four five six seven eight nine ten eleven twelve")],
      40,
      wrapWords,
    ),
  ).toBe("  a  one two three four five six seven\n     eight nine ten eleven twelve");
});

test("when the names leave too little room, each explanation goes under its name", () => {
  expect(twoColumns([row("--a-rather-long-flag <x>", "what it does")], 40, wrapWords)).toBe(
    "  --a-rather-long-flag <x>\n      what it does",
  );
});

test("a closing default stays on one line and is dimmed", () => {
  expect(optionText("DB file (default: under the data directory)", 20, plain)).toEqual([
    "DB file",
    "(default: under the data directory)",
  ]);
  expect(optionText("x (default: y)", 40, styles(true)).at(-1)).toBe(
    "x \x1b[2m(default: y)\x1b[0m",
  );
});

test("a flag's placeholder is dimmed apart from the flag itself", () => {
  expect(styleFlag("--db <path>", styles(true))).toBe("\x1b[36m--db\x1b[0m \x1b[2m<path>\x1b[0m");
  expect(styleFlag("-f, --follow", plain)).toBe("-f, --follow");
});
