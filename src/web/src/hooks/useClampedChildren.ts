import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * Whether any list item's content is cut off by its line clamp. Re-checked when the items change,
 * when the list resizes (the drawer can be resized) and once the web fonts are in: a clamped item
 * keeps its two-line height whatever it holds, so neither of the last two resizes the list. Not
 * measured while expanded: nothing is cut.
 */
export function useClampedChildren(
  ref: RefObject<HTMLElement | null>,
  items: string[],
  expanded: boolean,
): boolean {
  const [cut, setCut] = useState(false);
  // `items` isn't read in the effect, but new text can be cut where the old wasn't
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setCut(anyChildCut(el));
    measure();
    let live = true;
    void document.fonts.ready.then(() => live && measure());
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [ref, items, expanded]);
  return cut;
}

/** Whether an item's content overflows its clamped box (1px of slack for rounding). */
function anyChildCut(list: HTMLElement): boolean {
  return [...list.querySelectorAll<HTMLElement>("li > div")].some(
    (d) => d.scrollHeight > d.clientHeight + 1,
  );
}
