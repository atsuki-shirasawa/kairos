import type * as React from "react";
import { cn } from "@/lib/utils.ts";

/**
 * How a tag sits: `outline` is the drawer's Headless badge and the open items' kind (12px
 * `muted-ink`), `compact` a tighter one that keeps the size and tone of the line it is in (the
 * running sessions' Background and Fast).
 */
type TagVariant = "outline" | "compact";

const VARIANTS: Record<TagVariant, string> = {
  outline: "shrink-0 whitespace-nowrap px-1.5 text-label text-muted-foreground",
  compact: "px-1 leading-4",
};

/**
 * A small label beside text, in a 1px `border` outline with `md` radius (DESIGN.md, Tag). One
 * component, so the badges of the drawer, the open items and the running sessions can't drift apart.
 */
function Tag({
  variant = "outline",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: TagVariant }) {
  return (
    <span
      data-slot="tag"
      className={cn("rounded-md border", VARIANTS[variant], className)}
      {...props}
    />
  );
}

export { Tag };
