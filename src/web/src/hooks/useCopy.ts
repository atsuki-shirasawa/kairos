import { useCallback, useEffect, useRef, useState } from "react";

/** How long the "copied" state lasts, long enough to notice without lingering. */
const COPIED_MS = 1500;

/** Where the last copy stands: copied, failed, or nothing to copy (a text that came back null). */
export type CopyState = "idle" | "copied" | "failed" | "empty";

/** A text still being built resolves to null when there turned out to be nothing to copy. */
class NothingToCopy extends Error {}

/**
 * Writes a text that is still being built. The promise goes to the clipboard as it is, so the
 * click's permission to write lasts until the text is ready (Safari ends it at the first await).
 */
function writeLater(text: Promise<string | null>): Promise<void> {
  const blob = text.then((t) => {
    if (t === null) throw new NothingToCopy();
    return new Blob([t], { type: "text/plain" });
  });
  // Whatever the clipboard says, the text's own failure (or emptiness) is the reason to report
  const because = (e: unknown) => blob.then(() => Promise.reject(e));
  try {
    return navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).catch(because);
  } catch (e) {
    // No ClipboardItem, or one that takes no promise
    return because(e);
  }
}

/**
 * Copies text to the clipboard and reports it for a moment (to swap the button's icon and label).
 * The text may still be on its way (a report fetched on click). 127.0.0.1 counts as a secure
 * context, so the Clipboard API is available.
 */
export function useCopy(): [
  state: CopyState,
  copy: (text: string | Promise<string | null>) => void,
] {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((text: string | Promise<string | null>) => {
    const settle = (next: Exclude<CopyState, "idle">) => {
      setState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), COPIED_MS);
    };
    // `clipboard` is missing outside secure contexts (e.g. opened by a LAN address)
    const write =
      typeof text !== "string"
        ? navigator.clipboard
          ? writeLater(text)
          : text.then(() => Promise.reject(new Error("no clipboard")))
        : navigator.clipboard
          ? navigator.clipboard.writeText(text)
          : Promise.reject(new Error("no clipboard"));
    void write.then(
      () => settle("copied"),
      (e: unknown) => settle(e instanceof NothingToCopy ? "empty" : "failed"),
    );
  }, []);

  return [state, copy];
}
