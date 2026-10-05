import { ArrowDown, ArrowUp } from "lucide-react";
import type { ListSort } from "@/hooks/useUrlState.ts";
import { listMessages } from "@/i18n/messages/list.tsx";
import { cn } from "@/lib/utils.ts";
import { Hint } from "../Hint.tsx";

/** A column header that sorts by its column when clicked, with an arrow while active. */
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  className,
  title,
}: {
  label: string;
  sortKey: string;
  sort: ListSort;
  onSort: (key: string) => void;
  align?: "left" | "right";
  className?: string | undefined;
  title?: string | undefined;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.desc ? ArrowDown : ArrowUp;
  return (
    <th
      className={cn("p-0 font-normal", className)}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <Hint text={title} className="block">
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          aria-label={listMessages().sortBy(label)}
          className={cn(
            "flex w-full items-center gap-0.5 whitespace-nowrap px-2 py-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
            align === "right" ? "justify-end" : "justify-start pl-4",
            active && "font-medium text-foreground",
          )}
        >
          {label}
          {active && sortKey !== "start" && <Arrow className="size-3" />}
        </button>
      </Hint>
    </th>
  );
}
