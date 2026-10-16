#!/usr/bin/env bun
// Keeps text sizes on the type scale in src/web/src/index.css (DESIGN.md, Typography). Tailwind's
// own sizes are switched off there, so a stray `text-xs` would silently do nothing, and an
// arbitrary `text-[13px]` would add a size nobody chose.
import { readFileSync } from "node:fs";
import { SCALE } from "../src/web/src/lib/typeScale.ts";

/** A text size off the scale, where it was written. */
export interface OffScale {
  /** 1-based line. */
  line: number;
  /** The class as written ("text-[13px]", "text-xs"). */
  size: string;
}

/** Components and the stylesheet, where `@apply` could still name a size. */
const FILES = "src/web/src/**/*.{ts,tsx,css}";

/**
 * An absolute length in brackets (`text-[13px]`, `text-[length:1rem]`, `text-[10pt]`), or one of
 * Tailwind's own size names. Sizes relative to the text around them (`text-[0.85em]` for inline
 * code, a percentage) are not a step of the scale, so they pass.
 */
const OFF_SCALE =
  /(?<![\w-])text-(?:\[(?:length:)?\d*\.?\d+(?:px|rem|pt|pc|cm|mm|in|q|vw|vh|vmin|vmax)\]|(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-]))/g;

/** Finds the text sizes written off the scale in one source file. */
export function findOffScale(source: string): OffScale[] {
  return source
    .split("\n")
    .flatMap((text, i) => [...text.matchAll(OFF_SCALE)].map((m) => ({ line: i + 1, size: m[0] })));
}

if (import.meta.main) {
  const problems = [...new Bun.Glob(FILES).scanSync(".")]
    .sort()
    .flatMap((file) =>
      findOffScale(readFileSync(file, "utf8")).map((o) => `${file}:${o.line}  ${o.size}`),
    );
  if (problems.length > 0) {
    console.error(
      `${problems.length} text sizes are off the type scale (use ${SCALE.map((s) => `text-${s}`).join(" / ")}, see index.css):\n`,
    );
    console.error(problems.join("\n"));
    process.exit(1);
  }
}
