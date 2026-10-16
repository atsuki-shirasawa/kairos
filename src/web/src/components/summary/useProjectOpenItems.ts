import { useMemo } from "react";
import { useOpenItems } from "@/hooks/queries.ts";
import { type OpenItemEdits, useOpenItemEdits } from "@/hooks/useOpenItemEdits.ts";
import { groupOpenItems, type ProjectOpenItems } from "@/lib/openItems.ts";

/**
 * The period's open items by project, a way to close or reopen one by hand, the item being
 * updated, and which update failed last and why.
 */
export function useProjectOpenItems(
  from: number,
  to: number,
  now: number,
): OpenItemEdits & {
  openItems: Map<number, ProjectOpenItems>;
  at: number;
} {
  const list = useOpenItems(from, to).data?.items;
  // Ages run to now while the period is still going
  const at = Math.min(now, to);
  const openItems = useMemo(() => groupOpenItems(list ?? [], from, to, at), [list, from, to, at]);
  return { openItems, at, ...useOpenItemEdits() };
}
