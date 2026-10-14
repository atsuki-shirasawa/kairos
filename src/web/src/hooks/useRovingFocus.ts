import type { KeyboardEvent, RefObject } from "react";

/** Moving focus between a text field and the buttons of a list under it with the arrow keys. */
export interface RovingFocus {
  /** Focuses the list's first button (↓ from the field). */
  focusFirst: () => void;
  /** Key handler for each button: ↓ / ↑ move along the list, ↑ from the top and Esc go back to the field. */
  onItemKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Arrow-key focus between `inputRef` and the buttons inside `listRef`. The buttons are looked up
 * when a key is pressed, so the list can change between renders.
 */
export function useRovingFocus(
  listRef: RefObject<HTMLElement | null>,
  inputRef: RefObject<HTMLInputElement | null>,
): RovingFocus {
  const items = () => [...(listRef.current?.querySelectorAll("button") ?? [])];
  return {
    focusFirst: () => items()[0]?.focus(),
    onItemKeyDown: (e) => {
      const list = items();
      const i = list.indexOf(e.currentTarget);
      if (e.key === "ArrowDown") list[i + 1]?.focus();
      else if (e.key === "ArrowUp") (i > 0 ? list[i - 1] : inputRef.current)?.focus();
      else if (e.key === "Escape") inputRef.current?.focus();
      else return;
      e.preventDefault();
      // Keep Esc from also closing the drawer
      e.stopPropagation();
    },
  };
}
