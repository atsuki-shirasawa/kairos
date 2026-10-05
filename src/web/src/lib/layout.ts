// カレンダーの日の列に、作業ブロックを重ならないように並べる。
// Google カレンダーと同じく、開始が見出し 1 行ぶん以上離れていれば同じ列に少しずらして重ね、
// 開始がほぼ同時で見出しがぶつかるときだけ横に分ける。横に分けると週表示で列が細くなりすぎるため。
import type { CalendarSegment, CalendarSession } from "@shared/api.ts";
import { DAY, MINUTE } from "./dates.ts";

/**
 * 短すぎるブロックも見出しが 1 行読めるよう、描画上はこの長さを最低限確保する。
 * 重ねるときも、前のブロックの見出しが隠れないようこの長さだけ開始をずらす。
 */
export const MIN_BLOCK_MS = 25 * MINUTE;

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
  /** 横に分けたときの列と、まとまり全体の列数。 */
  col: number;
  cols: number;
  /** 右隣の空いている列へ広げる数（1 なら自分の列だけ）。 */
  span: number;
  /** 同じ列で下に重なっているブロックの数。その数だけ右にずらし、上に描く。 */
  depth: number;
  /** 上に別のブロックが重なり始める時刻（日の 0 時から）。見出しはそこまでに収める。 */
  coveredFrom: number | null;
}

/** 日の中に切り出した作業ブロック（配置の前）。リスト表示でもこのまま使う。 */
export type DayBlock = Omit<PlacedBlock, "col" | "cols" | "span" | "depth" | "coveredFrom">;

const visualEnd = (b: { start: number; end: number }) => Math.max(b.end, b.start + MIN_BLOCK_MS);

/** `dayStart` の日にかかる作業ブロックを、日の範囲で切って開始順に返す。 */
export function blocksOfDay(
  sessions: CalendarSession[],
  dayStart: number,
  dayEnd = dayStart + DAY,
): DayBlock[] {
  const items: DayBlock[] = [];
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
  // 長いものを先に置くと、短いものがその上に重なって見出しが両方読める
  return items.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** `dayStart` の日に表示するブロックを、重なりを考えて配置する。 */
export function layoutDay(
  sessions: CalendarSession[],
  dayStart: number,
  dayEnd = dayStart + DAY,
): PlacedBlock[] {
  const items = blocksOfDay(sessions, dayStart, dayEnd);

  const placed: PlacedBlock[] = [];
  let columns: PlacedBlock[][] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const all = columns.flat();
    for (const b of all) {
      b.cols = columns.length;
      // 右の列に見た目で重なるブロックがなければ、そこまで広げる
      let span = 1;
      while (
        b.col + span < columns.length &&
        !columns[b.col + span]?.some((o) => o.start < visualEnd(b) && b.start < visualEnd(o))
      )
        span++;
      b.span = span;
    }
    placed.push(...all);
    columns = [];
  };

  for (const item of items) {
    if (item.start >= clusterEnd) closeCluster();
    // 列の最後のブロックと開始が見出し 1 行ぶん離れていれば、その列に重ねられる。
    // 重ねられる列のうち、下に残っているブロックがいちばん少ない列を選ぶ（空いた列なら全幅で置ける）
    let col = -1;
    let depth = 0;
    columns.forEach((c, i) => {
      if ((c.at(-1)?.start ?? -Infinity) + MIN_BLOCK_MS > item.start) return;
      const d = c.filter((o) => visualEnd(o) > item.start).length;
      if (col === -1 || d < depth) [col, depth] = [i, d];
    });
    if (col === -1) {
      col = columns.length;
      columns.push([]);
    }
    const column = columns[col] ?? [];
    for (const o of column) if (visualEnd(o) > item.start) o.coveredFrom ??= item.start;
    column.push({ ...item, col, cols: 1, span: 1, depth, coveredFrom: null });
    clusterEnd = Math.max(clusterEnd, visualEnd(item));
  }
  closeCluster();
  return placed;
}

/** ブロックの和集合の長さ。並行して進めたセッションを二重に数えないよう、重なりは 1 回だけ数える。 */
export function busyMs(blocks: Pick<DayBlock, "start" | "end">[]): number {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const { start, end } of sorted) {
    if (start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    } else curEnd = Math.max(curEnd, end);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}
