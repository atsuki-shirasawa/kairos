// Fills of a block in its project color, shared by the week's cards and the month's lines so both
// read the same. Each is the project color (`--c`) mixed into an achromatic base in oklch, which
// keeps each project's hue (see --block-base). Spelled out whole so Tailwind can pick up the class
// names.

/**
 * A card's fill as the `--fill` variable, painted over the block's real length only (see
 * `blockStyle`), with its text tone: summarized work, work not summarized yet (dim), and the
 * deeper fill while its button is hovered.
 */
export const CARD_FILL = {
  normal:
    "text-foreground [--fill:color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))]",
  dim: "text-muted-foreground [--fill:color-mix(in_oklch,var(--c)_var(--mix-block-dim),var(--block-base))]",
  hover:
    "has-[>button:hover]:[--fill:color-mix(in_oklch,var(--c)_var(--mix-block-hover),var(--block-base))]",
} as const;

/** A month line's fill as its background, with the same tones and hover as a card's. */
export const LINE_FILL = {
  normal:
    "bg-[color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))] font-medium text-foreground",
  dim: "bg-[color-mix(in_oklch,var(--c)_var(--mix-block-dim),var(--block-base))] text-muted-foreground",
  hover: "hover:bg-[color-mix(in_oklch,var(--c)_var(--mix-block-hover),var(--block-base))]",
} as const;

/**
 * A block that doesn't match the search keeps only its shape, and comes back on hover or focus so
 * it stays readable. A card also rises above the matching blocks over it while it does.
 */
export const FADED = {
  card: "opacity-30 transition-opacity has-[>button:focus-visible]:z-(--z-raised) has-[>button:hover]:z-(--z-raised) has-[>button:focus-visible]:opacity-100 has-[>button:hover]:opacity-100 motion-reduce:transition-none",
  line: "opacity-30 transition-opacity hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none",
} as const;
