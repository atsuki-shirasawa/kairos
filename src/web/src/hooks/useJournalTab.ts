import { useEffect, useState } from "react";
import { JOURNAL_DEFAULT, placeOf } from "@/lib/layouts.ts";
import type { Layout } from "@/lib/view.ts";

/**
 * The Journal's layout last shown (the calendar before any), so going back to the Journal from
 * Today returns to the tab you left rather than always to the calendar.
 */
export function useJournalTab(layout: Layout): Layout {
  const inJournal = placeOf(layout) === "journal";
  const [last, setLast] = useState<Layout>(inJournal ? layout : JOURNAL_DEFAULT);
  useEffect(() => {
    if (inJournal) setLast(layout);
  }, [inJournal, layout]);
  return inJournal ? layout : last;
}
