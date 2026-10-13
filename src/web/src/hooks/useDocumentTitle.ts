import { useEffect } from "react";
import { documentTitle } from "@/lib/live.ts";

/**
 * Leads the tab title with the number of running sessions that want an answer, so a Kairos tab
 * in the background still says when one is waiting.
 */
export function useDocumentTitle(attention: number): void {
  useEffect(() => {
    document.title = documentTitle(attention);
  }, [attention]);
}
