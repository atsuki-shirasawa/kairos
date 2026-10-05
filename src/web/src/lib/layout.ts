// カレンダーの日の列に、作業ブロックを重ならないように並べる（Google カレンダーと同じく横に分ける）。
import type { CalendarSegment, CalendarSession } from "@shared/api.ts";
import { DAY, MINUTE } from "./dates.ts";

/** 短すぎるブロックも読めるよう、描画上はこの長さを最低限確保する。 */
export const MIN_BLOCK_MS = 20 * MINUTE;

export interface PlacedBlock {
  session: CalendarSession;
  /** 元のセクション（見出しと、切る前の開始・終了）。 */
  segment: CalendarSegment;
  /** この日の 0 時（絶対時刻）。 */
  dayStart: number;
  /** 日の 0 時からの開始・終了（ミリ秒）。日をまたぐブロックは日ごとに切る。 */
  start: number;
  end: number;
  /** 前の日から続いている／次の日へ続く。 */
  continuesBefore: boolean;
  continuesAfter: boolean;
  col: number;
  cols: number;
}

/** `dayStart` の日に表示するブロックを、重なりを考えて配置する。 */
export function layoutDay(
  sessions: CalendarSession[],
  dayStart: number,
  dayEnd = dayStart + DAY,
): PlacedBlock[] {
  const items: Omit<PlacedBlock, "col" | "cols">[] = [];
  for (const session of sessions) {
    for (const segment of session.segments) {
      const { start: s, end: e } = segment;
      if (e < dayStart || s >= dayEnd) continue;
      items.push({
        session,
        segment,
        dayStart,
        start: Math.max(s, dayStart) - dayStart,
        end: Math.min(e, dayEnd) - dayStart,
        continuesBefore: s < dayStart,
        continuesAfter: e >= dayEnd,
      });
    }
  }
  items.sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: PlacedBlock[] = [];
  let cluster: PlacedBlock[] = [];
  let columnsEnd: number[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    for (const b of cluster) b.cols = columnsEnd.length;
    placed.push(...cluster);
    cluster = [];
    columnsEnd = [];
  };
  for (const item of items) {
    const visualEnd = Math.max(item.end, item.start + MIN_BLOCK_MS);
    if (item.start >= clusterEnd) closeCluster();
    let col = columnsEnd.findIndex((end) => end <= item.start);
    if (col === -1) {
      col = columnsEnd.length;
      columnsEnd.push(visualEnd);
    } else {
      columnsEnd[col] = visualEnd;
    }
    cluster.push({ ...item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, visualEnd);
  }
  closeCluster();
  return placed;
}
