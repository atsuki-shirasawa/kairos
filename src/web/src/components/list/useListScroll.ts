import { useLayoutEffect, useRef } from "react";
import { reveal } from "@/lib/reveal.ts";

/**
 * Scroll handling of the table: a new period (`firstDay`) starts from the top, and the selected row
 * is scrolled into view when off screen (after switching from the calendar, moving with j / k, etc.).
 * Returns refs for the scroll container and the sticky header, whose height the reveal leaves clear.
 */
export function useListScroll(
  firstDay: number,
  selectedId: string | null,
  selectedAt: number | null,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the period (firstDay) changes
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [firstDay]);

  // After a period change too, look for the selection once scrolled back to the top
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the selection or period changes
  useLayoutEffect(() => {
    const el = scrollRef.current?.querySelector("tr[data-selected]") ?? null;
    reveal(scrollRef.current, el, theadRef.current?.offsetHeight ?? 0);
  }, [selectedId, selectedAt, firstDay]);

  return { scrollRef, theadRef };
}
