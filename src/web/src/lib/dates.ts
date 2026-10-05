// 日付の計算と表示。時刻はブラウザのローカル時刻（JST を想定）で扱う。

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type View = "week" | "day";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 日付を足す。夏時間はないが、念のため Date の日付演算で行う。 */
export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** 週の始まり（月曜 0 時）。 */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  const offset = (d.getDay() + 6) % 7;
  return addDays(d.getTime(), -offset);
}

/** 表示中の期間 [from, to) と、その中の日の 0 時の一覧。 */
export function rangeOf(view: View, anchor: number): { from: number; to: number; days: number[] } {
  const from = view === "week" ? startOfWeek(anchor) : startOfDay(anchor);
  const n = view === "week" ? 7 : 1;
  const days = Array.from({ length: n }, (_, i) => addDays(from, i));
  return { from, to: addDays(from, n), days };
}

export function shift(view: View, anchor: number, dir: -1 | 1): number {
  return addDays(anchor, (view === "week" ? 7 : 1) * dir);
}

export function weekday(t: number): string {
  return WEEKDAYS[new Date(t).getDay()] ?? "";
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

export function hhmm(t: number): string {
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 期間の見出し。週: 「2026年10月5日 – 11日」、日: 「2026年10月5日（月）」 */
export function rangeLabel(view: View, anchor: number): string {
  const { from, to } = rangeOf(view, anchor);
  const a = new Date(from);
  const head = `${a.getFullYear()}年${a.getMonth() + 1}月${a.getDate()}日`;
  if (view === "day") return `${head}（${weekday(from)}）`;
  const b = new Date(to - 1);
  if (b.getFullYear() !== a.getFullYear())
    return `${head} – ${b.getFullYear()}年${b.getMonth() + 1}月${b.getDate()}日`;
  if (b.getMonth() !== a.getMonth()) return `${head} – ${b.getMonth() + 1}月${b.getDate()}日`;
  return `${head} – ${b.getDate()}日`;
}

export function dateLabel(t: number): string {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日（${weekday(t)}）`;
}

export function durationLabel(ms: number): string {
  const m = Math.max(1, Math.round(ms / MINUTE));
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}時間${m % 60}分` : `${h}時間`;
}

/** URL に載せる日付（YYYY-MM-DD）。 */
export function toISODate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromISODate(s: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
