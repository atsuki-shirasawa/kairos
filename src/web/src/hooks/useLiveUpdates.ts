import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys } from "@/hooks/queries.ts";
import { subscribe } from "@/lib/api.ts";

/** Refetches affected data on server update events. Returns the import progress. */
export function useLiveUpdates(): { done: number; total: number } | null {
  const client = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "ingest.progress") {
          setProgress(event.done >= event.total ? null : { done: event.done, total: event.total });
          return;
        }
        // The registry changed (a session started, ended, or finished a turn); the log didn't
        if (event.type === "live.updated") {
          void client.invalidateQueries({ queryKey: keys.live });
          return;
        }
        void client.invalidateQueries({ queryKey: keys.allCalendar });
        // Recaps are listed under "calendar", so the line above already refetches them
        if (event.type === "recap.updated") return;
        if (event.type === "summary.updated") {
          void client.invalidateQueries({ queryKey: keys.session(event.sessionId) });
          return;
        }
        // The tool in flight, tasks and tests come from the log
        void client.invalidateQueries({ queryKey: keys.live });
        for (const id of event.ids) {
          void client.invalidateQueries({ queryKey: keys.session(id) });
          void client.invalidateQueries({ queryKey: keys.allMessages(id) });
        }
      }),
    [client],
  );

  return progress;
}
