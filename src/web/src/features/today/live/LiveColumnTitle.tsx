import { liveMessages } from "@/i18n/messages/live.ts";
import type { LiveColumn } from "@/lib/live.ts";
import { cn } from "@/lib/utils.ts";

/**
 * A group of running sessions named by its column, with its count: in `warn` when sessions wait on
 * you, so the count calls for you wherever the group is listed.
 */
export function LiveColumnTitle({
  column,
  count,
  id,
  level,
}: {
  column: LiveColumn;
  count: number;
  /** For the section the title labels. */
  id: string;
  level: "h2" | "h3";
}) {
  const Heading = level;
  return (
    <Heading id={id} className="flex items-baseline gap-2 font-medium text-body">
      {liveMessages().columns[column]}
      <span
        className={cn(
          "font-num",
          column === "attention" && count > 0 ? "text-warn" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Heading>
  );
}
