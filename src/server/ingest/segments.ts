/** 作業ブロックを分ける既定の間隔（15 分）。 */
export const DEFAULT_GAP_MS = 15 * 60_000;

export type Segment = [start: number, end: number];

/** 昇順に並んだ時刻を、`gapMs` より長く空いたところで区切る。 */
export function toSegments(sortedTimes: number[], gapMs = DEFAULT_GAP_MS): Segment[] {
  const segs: Segment[] = [];
  for (const t of sortedTimes) {
    const last = segs.at(-1);
    if (last && t - last[1] <= gapMs) last[1] = t;
    else segs.push([t, t]);
  }
  return segs;
}
