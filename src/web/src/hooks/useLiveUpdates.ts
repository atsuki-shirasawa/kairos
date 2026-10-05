import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribe } from "@/lib/api.ts";

/** サーバーからの更新通知を受けて、関係するデータを取り直す。取り込みの進み具合を返す。 */
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
        void client.invalidateQueries({ queryKey: ["calendar"] });
        if (event.type === "summary.updated") {
          void client.invalidateQueries({ queryKey: ["session", event.sessionId] });
          return;
        }
        for (const id of event.ids) {
          void client.invalidateQueries({ queryKey: ["session", id] });
          void client.invalidateQueries({ queryKey: ["messages", id] });
        }
      }),
    [client],
  );

  return progress;
}
