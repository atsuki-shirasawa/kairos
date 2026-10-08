// How each message dictionary names the shown period. Kept in one place so a new view is added
// once, not in every area that mentions "this week".
import type { View } from "@/lib/dates.ts";

/** The period's unit: "Previous month". */
export const UNIT_EN: Record<View, string> = { month: "month", week: "week", day: "day" };
/** The shown period: "No sessions this month". */
export const THIS_EN: Record<View, string> = {
  month: "this month",
  week: "this week",
  day: "this day",
};
/** The period's unit in Japanese: "前の月". */
export const UNIT_JA: Record<View, string> = { month: "月", week: "週", day: "日" };
/** The shown period in Japanese: "この月の記録はありません". */
export const THIS_JA: Record<View, string> = { month: "この月", week: "この週", day: "この日" };
