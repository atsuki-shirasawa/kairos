import { type RefObject, useEffect, useRef } from "react";

/**
 * Scrolls the selected row into view whenever `key` changes, so stepping with j / k or opening a
 * block from search never leaves the row it opened off screen. The key includes whether the row
 * is drawn yet, so a selection made before its day loads scrolls once the row arrives. `nearest`
 * leaves the list where it is when the row already shows.
 */
export function useScrollToSelected<T extends HTMLElement>(key: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the selection changes
  useEffect(() => {
    ref.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "nearest" });
  }, [key]);
  return ref;
}
