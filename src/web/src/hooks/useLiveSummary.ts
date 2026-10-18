import type { LiveResponse, LiveSession, Project } from "@shared/api.ts";
import { useMemo } from "react";
import type { LiveSummary } from "@/components/toolbar/LiveButton.tsx";
import { useLive } from "@/hooks/queries.ts";
import { attentionCount, liveDisplay, visibleLive } from "@/lib/live.ts";

/** The running sessions, for Today's Now, and the counts the toolbar's button shows. */
export interface LiveState {
  /** The live response, undefined until it first loads. */
  data: LiveResponse | undefined;
  /** Running sessions not hidden, in Now's order. */
  running: LiveSession[];
  summary: LiveSummary;
}

/** Fetches the running sessions and sums up what the toolbar's live button shows. */
export function useLiveSummary(projectMap: Map<number, Project>, now: number): LiveState {
  const live = useLive();
  const running = useMemo(
    () => visibleLive(live.data?.sessions ?? [], projectMap, now),
    [live.data, projectMap, now],
  );
  const summary: LiveSummary = {
    running: running.length,
    attention: attentionCount(running, now),
    working: running.some((s) => liveDisplay(s, now) === "working"),
  };
  return { data: live.data, running, summary };
}
