/** Default gap that separates work blocks (15 minutes). */
export const DEFAULT_GAP_MS = 15 * 60_000;

export type Segment = [start: number, end: number];

/** Splits ascending times wherever the gap is longer than `gapMs`. */
export function toSegments(sortedTimes: number[], gapMs = DEFAULT_GAP_MS): Segment[] {
  const segs: Segment[] = [];
  for (const t of sortedTimes) {
    const last = segs.at(-1);
    if (last && t - last[1] <= gapMs) last[1] = t;
    else segs.push([t, t]);
  }
  return segs;
}
