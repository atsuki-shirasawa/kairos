import type { LaneLook, LaneMark } from "@/lib/dayRows.ts";
import { cn } from "@/lib/utils.ts";

/**
 * From the row's top to the center of its heading's first line, where a session's node sits: the
 * row's card margin and padding plus half a `text-body` line.
 */
const NODE_Y = "1.25rem";

/**
 * The lanes beside one row of the day page, read like a git graph: each session is a line in its
 * project color, its blocks are nodes on it, and sessions that ran at the same time are parallel
 * lines. Drawn for the eye only; the row's text says the same.
 */
export function Lanes({
  marks,
  looks,
}: {
  marks: LaneMark[];
  looks: ReadonlyMap<string, LaneLook>;
}) {
  return (
    <span className="flex shrink-0 self-stretch" aria-hidden>
      {marks.map((mark, i) => (
        <Lane
          // biome-ignore lint/suspicious/noArrayIndexKey: a lane is its position
          key={i}
          mark={mark}
          look={mark.kind === "none" ? undefined : looks.get(mark.sessionId)}
        />
      ))}
    </span>
  );
}

/**
 * One lane in one row: nothing, a line passing through or stopping here, or the row's own node
 * with its line.
 */
function Lane({ mark, look }: { mark: LaneMark; look: LaneLook | undefined }) {
  const style = { "--c": look?.color, "--node-y": NODE_Y } as React.CSSProperties;
  const dashed = look?.headless ?? false;
  return (
    <span className="relative w-3.5" style={style}>
      {mark.kind === "through" && <LaneLine className="inset-y-0" dashed={dashed} />}
      {mark.kind === "end" && <LaneLine className="top-0 h-(--node-y)" dashed={dashed} />}
      {mark.kind === "node" && (
        <>
          {mark.above && <LaneLine className="top-0 h-(--node-y)" dashed={dashed} />}
          {mark.below && <LaneLine className="top-(--node-y) bottom-0" dashed={dashed} />}
          <span className="absolute top-(--node-y) left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--c) ring-2 ring-card" />
        </>
      )}
    </span>
  );
}

/**
 * A stretch of a session's line. A dashed one is a headless run, as a block's dashed edge is on
 * the calendar: the solid line is the work you prompted.
 */
function LaneLine({ className, dashed }: { className: string; dashed: boolean }) {
  return (
    <span
      className={cn(
        "absolute left-1/2 -translate-x-1/2 border-(--c) border-l-2",
        dashed && "border-dashed",
        className,
      )}
    />
  );
}
