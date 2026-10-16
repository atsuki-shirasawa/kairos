import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribe } from "@/lib/api.ts";
import { isStaleAfter } from "@/lib/invalidation.ts";

/** How far an import has got, or `null` when none is running. */
export type ImportProgress = { done: number; total: number } | null;

/**
 * Refetches the data a server update event makes stale (see `isStaleAfter`), and everything after
 * the event stream reconnects (the events sent while it was down are lost). Returns the import
 * progress.
 */
export function useLiveUpdates(): ImportProgress {
  const client = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress>(null);

  useEffect(
    () =>
      subscribe(
        (event) => {
          if (event.type === "ingest.progress")
            setProgress(
              event.done >= event.total ? null : { done: event.done, total: event.total },
            );
          else
            void client.invalidateQueries({
              predicate: (q) => isStaleAfter(event, q.queryKey, q.state.data),
            });
        },
        () => void client.invalidateQueries(),
      ),
    [client],
  );

  return progress;
}
