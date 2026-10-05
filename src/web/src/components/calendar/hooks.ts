import { type RefObject, useCallback, useLayoutEffect, useState } from "react";
import { type Edges, findEdges, NO_EDGES, sameEdges } from "@/lib/calendarGrid.ts";
import type { PlacedBlock } from "@/lib/layout.ts";
import { reveal } from "@/lib/reveal.ts";
import { MIN_HOUR_PX, VIEW_END, VIEW_START } from "./constants.ts";

/** Measured size of the grid's scroll area, and the hour height derived from it. */
export interface GridSize {
  hourPx: number;
  viewportPx: number;
  widthPx: number;
}

/**
 * Derives the hour height from the scroll area: just enough for the shown hours to fit, but never
 * below the minimum on short screens. Re-measures when the window resizes.
 * The width tells whether opening the drawer made the columns narrow.
 */
export function useGridSize(ref: RefObject<HTMLDivElement | null>): GridSize {
  const [size, setSize] = useState<GridSize>({ hourPx: MIN_HOUR_PX, viewportPx: 0, widthPx: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const viewportPx = el.clientHeight;
      const widthPx = el.clientWidth;
      // A quarter hour of slack at each end, so the first and last hour labels (centered on
      // their line) aren't cut in half by the edges of the scroll area
      const hourPx = Math.max(MIN_HOUR_PX, viewportPx / (VIEW_END - VIEW_START + 0.5));
      setSize((prev) =>
        prev.hourPx === hourPx && prev.viewportPx === viewportPx && prev.widthPx === widthPx
          ? prev
          : { hourPx, viewportPx, widthPx },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** What `useGridScroll` reacts to. */
interface GridScrollDeps {
  /** First shown day; a change means the period changed. */
  firstDay: number;
  hourPx: number;
  viewportPx: number;
  selectedId: string | null;
  selectedAt: number | null;
}

/**
 * Keeps the grid scrolled to something worth seeing. When the period changes, centers the shown
 * hours on screen; when the selection changes, scrolls the selected block into view if it's off
 * screen (after switching from the list, moving with j / k, etc.).
 */
export function useGridScroll(
  ref: RefObject<HTMLDivElement | null>,
  { firstDay, hourPx, viewportPx, selectedId, selectedAt }: GridScrollDeps,
): void {
  const revealSelected = useCallback(() => {
    const el = ref.current?.querySelector("[data-selected]");
    reveal(ref.current, el ?? null);
  }, [ref]);

  // Redo it when the height changes too (the first scroll uses a provisional height before measuring)
  // biome-ignore lint/correctness/useExhaustiveDependencies: also run when the period (firstDay) changes
  useLayoutEffect(() => {
    if (!ref.current) return;
    const center = ((VIEW_START + VIEW_END) / 2) * hourPx;
    ref.current.scrollTop = Math.max(0, center - viewportPx / 2);
    revealSelected();
  }, [ref, firstDay, hourPx, viewportPx, revealSelected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the selection changes
  useLayoutEffect(revealSelected, [selectedId, selectedAt, revealSelected]);
}

/** The off-screen hints, and the scroll handler that keeps them current. */
export interface OffscreenEdges {
  edges: Edges;
  measure: () => void;
}

/**
 * Work outside the shown hours (late night, early morning) is easy to miss, so this finds the blocks
 * scrolled out of view above and below, for a hint on each edge. Call `measure` on scroll.
 */
export function useOffscreenEdges(
  ref: RefObject<HTMLDivElement | null>,
  columns: PlacedBlock[][],
  hourPx: number,
  viewportPx: number,
): OffscreenEdges {
  const [edges, setEdges] = useState<Edges>(NO_EDGES);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const view = { scrollTop: el.scrollTop, heightPx: el.clientHeight, hourPx };
    const next = findEdges(columns.flat(), view);
    setEdges((prev) => (sameEdges(prev, next) ? prev : next));
  }, [ref, columns, hourPx]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure again when the height changes
  useLayoutEffect(measure, [measure, viewportPx]);
  return { edges, measure };
}
