import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEXT_SIZES } from "../../src/web/src/lib/typeScale.ts";
import { cn } from "../../src/web/src/lib/utils.ts";

const CSS = readFileSync(join(import.meta.dir, "../../src/web/src/index.css"), "utf8");

test("the size names are the ones index.css defines", () => {
  // `--text-<name>--line-height` goes with its size, so it isn't a size of its own
  const defined = [...CSS.matchAll(/^\s*--text-([\w-]+):/gm)]
    .map((m) => m[1] ?? "")
    .filter((name) => !name.includes("--"));
  expect([...defined].sort()).toEqual([...TEXT_SIZES].sort());
});

test("cn keeps a size beside a color, and the later of two sizes", () => {
  expect(cn("text-label text-muted-foreground")).toBe("text-label text-muted-foreground");
  expect(cn("text-body", "text-label")).toBe("text-label");
});
