import { useCallback, useEffect, useRef, useState } from "react";

/** How long the "copied" state lasts, long enough to notice without lingering. */
const COPIED_MS = 1500;

/**
 * Copies text to the clipboard and reports it for a moment (to swap the button's icon and label).
 * 127.0.0.1 counts as a secure context, so the Clipboard API is available.
 */
export function useCopy(): [state: "idle" | "copied" | "failed", copy: (text: string) => void] {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((text: string) => {
    const settle = (next: "copied" | "failed") => {
      setState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), COPIED_MS);
    };
    // `clipboard` is missing outside secure contexts (e.g. opened by a LAN address)
    const write = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("no clipboard"));
    void write.then(
      () => settle("copied"),
      () => settle("failed"),
    );
  }, []);

  return [state, copy];
}
