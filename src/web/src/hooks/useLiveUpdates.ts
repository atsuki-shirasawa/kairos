import type { ServerEvent } from "@shared/api.ts";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys } from "@/hooks/queries.ts";
import { subscribe } from "@/lib/api.ts";

/** How far an import has got, or `null` when none is running. */
export type ImportProgress = { done: number; total: number } | null;

/**
 * Refetches affected data on server update events, and everything after the event stream
 * reconnects (the events sent while it was down are lost). Returns the import progress.
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
          else invalidateFor(client, event);
        },
        () => void client.invalidateQueries(),
      ),
    [client],
  );

  return progress;
}

/** Refetches what a server event says has changed. */
function invalidateFor(
  client: QueryClient,
  event: Exclude<ServerEvent, { type: "ingest.progress" }>,
): void {
  // The registry changed (a session started, ended, or finished a turn); the log didn't
  if (event.type === "live.updated") {
    void client.invalidateQueries({ queryKey: keys.live });
    return;
  }
  void client.invalidateQueries({ queryKey: keys.allCalendar });
  // Recaps are listed under "calendar", so the line above already refetches them
  if (event.type === "recap.updated") return;
  // A new summary can close open items of other sessions (by its word or the log's refs), and
  // every drawer lists its sections' items with their state
  if (event.type === "summary.updated") {
    void client.invalidateQueries({ queryKey: keys.allSessions });
    return;
  }
  // The tool in flight, tasks and tests come from the log
  void client.invalidateQueries({ queryKey: keys.live });
  for (const id of event.ids) {
    void client.invalidateQueries({ queryKey: keys.session(id) });
    void client.invalidateQueries({ queryKey: keys.allMessages(id) });
  }
}
