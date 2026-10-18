import type { Recap } from "@shared/api.ts";
import { useMemo } from "react";
import { useRecaps, useRequestRecap } from "@/hooks/queries.ts";

/**
 * The period's recaps by project, a way to ask for one, and why the latest request was refused
 * (null when it wasn't).
 */
export function useProjectRecaps(
  from: number,
  to: number,
): {
  recaps: Map<number, Recap>;
  onRecap: (projectId: number) => void;
  requestError: string | null;
} {
  const recapList = useRecaps(from, to, true).data?.recaps;
  const recaps = useMemo(
    () => new Map((recapList ?? []).map((r) => [r.projectId, r])),
    [recapList],
  );
  const requestRecap = useRequestRecap();
  const onRecap = (projectId: number) => requestRecap.mutate({ projectId, from, to });
  return { recaps, onRecap, requestError: requestRecap.error?.message ?? null };
}
