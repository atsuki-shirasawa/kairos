import { useCallback, useState } from "react";
import type { ColumnKey } from "@/i18n/messages/list.tsx";
import { parseColumns } from "@/lib/listTable.ts";
import { COLUMN_ORDER, DEFAULT_COLUMNS } from "./columns.tsx";

const COLUMNS_KEY = "kairos.listColumns";

/** The column choice saved in this browser, or the default. */
function loadColumns(): ColumnKey[] {
  try {
    const saved = parseColumns(
      JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "null"),
      COLUMN_ORDER,
    );
    if (saved) return saved;
  } catch {
    // Storage unavailable or garbled: fall back to the default
  }
  return DEFAULT_COLUMNS;
}

/** Saves the column choice; null forgets it, so the default applies again. */
function saveColumns(next: ColumnKey[] | null): void {
  try {
    if (next === null) localStorage.removeItem(COLUMNS_KEY);
    else localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
  } catch {
    // Not persisted, but applies while the page stays open
  }
}

/** The chosen columns, saved in this browser only (like the theme). Null resets to the default. */
export function useColumns(): [ColumnKey[], (keys: ColumnKey[] | null) => void] {
  const [keys, setKeys] = useState(loadColumns);
  const change = useCallback((next: ColumnKey[] | null) => {
    setKeys(next ?? DEFAULT_COLUMNS);
    saveColumns(next);
  }, []);
  return [keys, change];
}
