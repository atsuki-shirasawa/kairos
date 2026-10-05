// 日付の計算と表示。時刻はブラウザのローカル時刻（JST を想定）で扱う。

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type View = "week" | "day";
export type Layout = "calendar" | "list";

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

/** ISO 8601 の週番号（月曜始まり、その年の最初の木曜を含む週が第 1 週）。 */
export function isoWeek(t: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getDay() + 6) % 7)) / 7,
    )
  );
}

/**
 * 期間の見出し。日の数字はカレンダーの列に出ているので、見出しは月を主役にする。
 * 週: { title: "9月 – 10月", year: "2026", week: "W40" }、日: { title: "10月5日", sub: "月曜日", year: "2026" }
 */
export function rangeTitle(
  view: View,
  anchor: number,
): { title: string; sub: string | null; year: string; week: string | null } {
  const { from, to } = rangeOf(view, anchor);
  const a = new Date(from);
  if (view === "day")
    return {
      title: `${a.getMonth() + 1}月${a.getDate()}日`,
      sub: `${weekday(from)}曜日`,
      year: String(a.getFullYear()),
      week: null,
    };
  const b = new Date(to - 1);
  const months =
    b.getMonth() === a.getMonth()
      ? `${a.getMonth() + 1}月`
      : `${a.getMonth() + 1}月 – ${b.getMonth() + 1}月`;
  const year =
    b.getFullYear() === a.getFullYear()
      ? String(a.getFullYear())
      : `${a.getFullYear()} – ${b.getFullYear()}`;
  return { title: months, sub: null, year, week: `W${isoWeek(from)}` };
}

/** 日付の短い表記。「10/5 月」。今年でなければ年を付ける（「2025/10/5 日」）。 */
export function dateLabel(t: number, now = Date.now()): string {
  const d = new Date(t);
  const md = `${d.getMonth() + 1}/${d.getDate()} ${weekday(t)}`;
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

/** 今日・昨日なら言葉で返す。それ以外は null。 */
export function relativeDay(t: number, now = Date.now()): string | null {
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  return diff === 0 ? "今日" : diff === 1 ? "昨日" : null;
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
