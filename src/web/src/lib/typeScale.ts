// The names of the text sizes `index.css` defines (`--text-<name>`), for class merging: `cn` has to
// know `text-label` is a size, or it takes it for a color and drops it beside `text-muted-foreground`.
// tests/web/typeScale.test.ts keeps these lists and index.css the same.

/** The type scale's steps, as in `text-<name>`, smallest first (DESIGN.md, Typography). */
export const SCALE = ["meta", "label", "body", "read", "title"] as const;

/** The sizes DESIGN.md allows off the scale: the totals, the wordmark, count badges, small controls. */
export const EXCEPTIONS = [
  "figure-lg",
  "figure-md",
  "figure-sm",
  "wordmark",
  "badge",
  "control",
] as const;

/** Every text size index.css defines. */
export const TEXT_SIZES = [...SCALE, ...EXCEPTIONS] as const;
