import { useMemo } from "react";
import { useOpenItems, useUpdateOpenItem } from "@/hooks/queries.ts";
import { groupOpenItems, type ProjectOpenItems } from "@/lib/openItems.ts";

/**
 * The period's open items by project, a way to close or reopen one by hand, the item being
 * updated, and which update failed last and why.
 */
export function useProjectOpenItems(
  from: number,
  to: number,
  now: number,
): {
  openItems: Map<number, ProjectOpenItems>;
  at: number;
  onUpdate: (id: number, state: "done" | "dismissed" | "open") => void;
  busyId: number | null;
  /** The item whose latest update failed, and why. */
  failure: { id: number; message: string } | null;
} {
  const list = useOpenItems(from, to).data?.items;
  // Ages run to now while the period is still going
  const at = Math.min(now, to);
  const openItems = useMemo(() => groupOpenItems(list ?? [], from, to, at), [list, from, to, at]);
  const update = useUpdateOpenItem();
  return {
    openItems,
    at,
    onUpdate: (id, state) => update.mutate({ id, update: { state } }),
    busyId: update.isPending ? (update.variables?.id ?? null) : null,
    failure:
      update.error && update.variables
        ? { id: update.variables.id, message: update.error.message }
        : null,
  };
}
