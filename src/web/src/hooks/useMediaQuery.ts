import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Wide enough for the drawer to sit beside the page instead of covering it with a backdrop
 * (Tailwind's `lg`, where its classes switch too).
 */
export const WIDE_QUERY = "(width >= 64rem)";

/** Whether the media query matches, kept current as the window is resized. */
export function useMediaQuery(query: string): boolean {
  const list = useMemo(() => matchMedia(query), [query]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [list],
  );
  return useSyncExternalStore(subscribe, () => list.matches);
}
