import type { OpenItemUpdate } from "@shared/api.ts";
import { useUpdateOpenItem } from "@/hooks/queries.ts";

/** Closes or reopens an item by hand. */
export type OnOpenItemUpdate = (id: number, state: OpenItemUpdate["state"]) => void;

/** Hand edits of open items, as a list of them needs: the edit, what is pending, what failed. */
export interface OpenItemEdits {
  onUpdate: OnOpenItemUpdate;
  /** The item being updated, whose buttons wait. */
  busyId: number | null;
  /** The item whose latest update failed, and why. */
  failure: { id: number; message: string } | null;
}

/** Closes or reopens open items by hand, tracking the one on its way and the last failure. */
export function useOpenItemEdits(): OpenItemEdits {
  const update = useUpdateOpenItem();
  return {
    onUpdate: (id, state) => update.mutate({ id, update: { state } }),
    busyId: update.isPending ? (update.variables?.id ?? null) : null,
    failure:
      update.error && update.variables
        ? { id: update.variables.id, message: update.error.message }
        : null,
  };
}
