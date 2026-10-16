import type * as React from "react";
import { cn } from "@/lib/utils.ts";

/** A color a filled dot takes. */
type DotTone = "project" | "ink" | "muted" | "warn" | "primary";

/**
 * What the dot says: `pulse` is work going on now and `solid` a state that holds (asking,
 * running), each in a tone; `ring` is one that waits or is done, always in `muted-ink`, so it
 * takes no tone.
 */
type DotLook = { state: "pulse" | "solid"; tone: DotTone } | { state: "ring" };

const FILL: Record<DotTone, string> = {
  // The project color, set as `--c` by the block, card or row around it
  project: "bg-[var(--c)]",
  ink: "bg-foreground",
  muted: "bg-muted-foreground",
  warn: "bg-warn",
  primary: "bg-primary",
};

/** The classes of a look; a filled one in its tone. */
function lookClasses(look: DotLook): string {
  if (look.state === "ring") return "border border-muted-foreground";
  return cn(FILL[look.tone], look.state === "pulse" && "animate-pulse motion-reduce:animate-none");
}

/**
 * The 6px dot that tells the state of a session, subagent or block (DESIGN.md, StatusDot): the
 * live page's cards and button, work in progress on the calendar and in the table, and the
 * drawer's active section. One component, so pulsing and rings read the same everywhere.
 */
function StatusDot({
  look,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { look: DotLook }) {
  return (
    <span
      data-slot="status-dot"
      className={cn("size-1.5 rounded-full", lookClasses(look), className)}
      {...props}
    />
  );
}

export { type DotLook, StatusDot };
