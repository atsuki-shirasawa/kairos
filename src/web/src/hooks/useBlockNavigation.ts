// Moving between blocks: stepping to the previous/next one, and leaving the drawer.
import type { CalendarSession } from "@shared/api.ts";
import { useCallback, useMemo } from "react";
import type { UrlStateUpdate } from "@/hooks/useUrlState.ts";
import { type BlockRef, orderedBlocks, selectedSegment, stepBlock } from "@/lib/navigation.ts";

/** The blocks either side of the selection, and how to open one. */
export interface BlockStepping {
  prev: BlockRef | null;
  next: BlockRef | null;
  /** Opens a block without pushing history; does nothing for null. */
  goTo: (block: BlockRef | null) => void;
}

/**
 * Steps to the previous/next block in time order (j / k and the drawer's ↑ ↓). Only blocks in
 * `focused` are visited, so while filtering only matching ones are. The selection itself is
 * looked up in `visible`, since it may be a block the filter now excludes.
 */
export function useBlockStepping({
  focused,
  visible,
  from,
  to,
  session,
  at,
  update,
}: {
  focused: CalendarSession[];
  visible: CalendarSession[];
  from: number;
  to: number;
  session: string | null;
  at: number | null;
  update: UrlStateUpdate;
}): BlockStepping {
  const ordered = useMemo(() => orderedBlocks(focused, from, to), [focused, from, to]);
  const currentAt = selectedSegment(visible, session, at)?.start ?? at;
  const current = session && currentAt !== null ? { id: session, at: currentAt } : null;
  // Not pushed to history, so the back button isn't stuck walking through every step
  const goTo = useCallback(
    (b: BlockRef | null) => {
      if (b) update({ session: b.id, at: b.at });
    },
    [update],
  );
  return { prev: stepBlock(ordered, current, -1), next: stepBlock(ordered, current, 1), goTo };
}

/** The open block (calendar button, list or table row) in the main area. */
const SELECTED_BLOCK =
  "main button[data-selected], main tr[data-selected] button, main li[data-selected] button";

/**
 * Closes the drawer and returns focus to the block that was open, so keyboard navigation can
 * continue from it.
 */
export function useCloseDrawer(update: UrlStateUpdate): () => void {
  return useCallback(() => {
    const el = document.querySelector<HTMLElement>(SELECTED_BLOCK);
    update({ session: null, at: null });
    el?.focus({ preventScroll: true });
  }, [update]);
}
