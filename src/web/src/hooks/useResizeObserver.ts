import { type RefObject, useLayoutEffect } from "react";

/**
 * Calls `measure` with the element once it is mounted (before paint, so the first frame already
 * uses the measured size) and again whenever it resizes. Pass a stable `measure` (`useCallback`):
 * a new one re-subscribes.
 */
export function useResizeObserver<T extends HTMLElement>(
  ref: RefObject<T | null>,
  measure: (el: T) => void,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => measure(el);
    run();
    const observer = new ResizeObserver(run);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, measure]);
}
