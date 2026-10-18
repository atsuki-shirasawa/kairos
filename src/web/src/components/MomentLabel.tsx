import type { Artifact } from "@shared/api.ts";
import { MomentNode } from "@/components/MomentNode.tsx";
import { artifactRef } from "@/lib/artifacts.ts";
import { hhmm } from "@/lib/dates.ts";
import { cn } from "@/lib/utils.ts";

/**
 * One commit or PR as a line of text: its node, time, short SHA or PR number, and title. The
 * calendar's tooltip and the day page's rows list a block's moments with it.
 */
export function MomentLabel({ artifact }: { artifact: Artifact }) {
  const pr = artifact.kind === "pr";
  const ref = artifactRef(artifact);
  return (
    <>
      <MomentNode pr={pr} />
      <span className="shrink-0">{artifact.ts !== null ? hhmm(artifact.ts) : ""}</span>
      {ref && <span className={cn("shrink-0", pr && "font-medium text-foreground")}>{ref}</span>}
      {artifact.title && (
        <span className="truncate font-sans text-foreground">{artifact.title}</span>
      )}
    </>
  );
}
