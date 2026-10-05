import { type RefObject, useEffect, useRef } from "react";

/**
 * Moves focus into the drawer when it opens, but only on narrow screens: there the drawer overlays
 * the calendar, while on wide screens it sits beside it and stealing focus would be a surprise.
 */
export function useFocusWhenOverlaid<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (matchMedia("(width < 64rem)").matches) ref.current?.focus();
  }, []);
  return ref;
}

/**
 * Scrolls back to the top whenever `key` changes, so the previous scroll position does not carry
 * over while reading with j / k. Skipped while `keep` is true: an open conversation scrolls itself
 * to the selected time.
 */
export function useScrollTopOnChange<T extends HTMLElement>(
  key: unknown,
  keep: boolean,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  // Read through a ref so toggling `keep` alone does not scroll
  const keepRef = useRef(keep);
  keepRef.current = keep;
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the key changes
  useEffect(() => {
    if (!keepRef.current) ref.current?.scrollTo({ top: 0 });
  }, [key]);
  return ref;
}
