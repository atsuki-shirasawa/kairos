import type { LiveSession, Project } from "@shared/api.ts";
import { useMemo } from "react";
import { usePickUpSessions } from "@/hooks/queries.ts";
import { type PickUpList, pickUp } from "@/lib/pickUp.ts";

/**
 * Pick up as the home page shows it: the sessions with work left open, ranked and capped at `now`,
 * leaving out the ones running (Now lists them). Null while loading.
 */
export function usePickUp(
  now: number,
  projects: ReadonlyMap<number, Project>,
  running: readonly LiveSession[],
): PickUpList | null {
  const { data } = usePickUpSessions();
  return useMemo(
    () =>
      data
        ? pickUp(data.sessions, now, { projects, running: new Set(running.map((s) => s.id)) })
        : null,
    [data, now, projects, running],
  );
}
