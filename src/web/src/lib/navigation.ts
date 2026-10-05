// 作業ブロックを時刻順にたどる（j / k とドロワーの ‹ ›）。カレンダーとリストで同じ順番を使う。
import type { CalendarSegment, CalendarSession } from "@shared/api.ts";

/** 作業ブロックの指し示し方。URL の `session` と `at` に対応する。 */
export interface BlockRef {
  id: string;
  at: number;
}

/** 期間 [from, to) にかかる作業ブロックを開始順に並べる。 */
export function orderedBlocks(sessions: CalendarSession[], from: number, to: number): BlockRef[] {
  return sessions
    .flatMap((s) =>
      s.segments
        // blocksOfDay と同じ判定にし、画面に出ているものだけをたどる
        .filter((g) => g.end >= from && g.start < to)
        .map((g) => ({ id: s.id, at: g.start })),
    )
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** 選択中の作業ブロック。`at` が null ならセッションの最後のブロック（ドロワーと同じ解釈）。 */
export function selectedSegment(
  sessions: CalendarSession[],
  id: string | null,
  at: number | null,
): CalendarSegment | null {
  if (!id) return null;
  const segments = sessions.find((s) => s.id === id)?.segments ?? [];
  return (at === null ? segments.at(-1) : segments.find((g) => g.start === at)) ?? null;
}

/**
 * 前後の作業ブロック。何も選んでいなければ、次へは最初、前へは最後を返す。
 * 選択中のものが期間の外（前後の週から続きのセッションへ移ったときなど）なら、時刻で近いものを返す。
 */
export function stepBlock(
  list: BlockRef[],
  current: BlockRef | null,
  dir: -1 | 1,
): BlockRef | null {
  if (!current) return (dir === 1 ? list[0] : list.at(-1)) ?? null;
  const i = list.findIndex((b) => b.id === current.id && b.at === current.at);
  if (i !== -1) return list[i + dir] ?? null;
  return (
    (dir === 1 ? list.find((b) => b.at > current.at) : list.findLast((b) => b.at < current.at)) ??
    null
  );
}
