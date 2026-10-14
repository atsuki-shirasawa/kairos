import { WORK_BLOCK_GAP_MS } from "../../shared/sections.ts";

/** A work block as [start, end] in epoch ms (both ends are activity times). */
export type Segment = [start: number, end: number];

/** Splits ascending times wherever the gap is longer than `gapMs`. */
export function toSegments(sortedTimes: number[], gapMs = WORK_BLOCK_GAP_MS): Segment[] {
  const segs: Segment[] = [];
  for (const t of sortedTimes) {
    const last = segs.at(-1);
    if (last && t - last[1] <= gapMs) last[1] = t;
    else segs.push([t, t]);
  }
  return segs;
}
