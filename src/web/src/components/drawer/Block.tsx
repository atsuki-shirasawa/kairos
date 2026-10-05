import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils.ts";

/** One titled block of the drawer body, with an optional control at the right end of its heading. */
export function Block({
  title,
  emphasis = false,
  action,
  children,
}: {
  title: string;
  /** The main block. Its heading is set in ink rather than muted; indigo stays for selection */
  emphasis?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      {/* A rule extends right of the heading, marking block boundaries with a line rather than a surface */}
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <h3
          className={cn(
            "shrink-0 font-semibold text-xs tracking-wide",
            emphasis ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {title}
        </h3>
        <span className="h-px flex-1 bg-border" />
        {action}
      </div>
      {children}
    </section>
  );
}

/** A full-width dashed button standing in for a collapsed block, so it reads as "more here". */
export function CollapsedBlock({
  onClick,
  expanded,
  children,
}: {
  onClick: () => void;
  /** Announced as `aria-expanded` when given. */
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="flex w-full items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-left text-muted-foreground text-sm hover:bg-accent hover:text-foreground"
    >
      <ChevronRight className="size-4 shrink-0" />
      {children}
    </button>
  );
}
