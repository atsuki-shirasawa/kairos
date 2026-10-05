import { defineMessages } from "../index.ts";
import { dateMessages } from "./dates.ts";

/** The date picker under the period heading. `month` is 0-based, as in `Date#getMonth`. */
export const datePickerMessages = defineMessages({
  en: {
    triggerLabel: (heading: string) => `${heading}. Pick a date to jump to`,
    isoWeekTitle: (week: string) => `ISO week ${week}`,
    monthHeading: (year: number, month: number) => `${dateMessages().month(month)} ${year}`,
    prevMonth: "Previous month",
    prevMonthTitle: "Previous month (PageUp)",
    nextMonth: "Next month",
    nextMonthTitle: "Next month (PageDown)",
    isoWeek: "ISO week number",
    weekNumber: "Week number",
    dayLabel: (month: number, day: number, hasRecord: boolean, inRange: boolean) =>
      `${dateMessages().month(month)} ${day}${hasRecord ? ", has sessions" : ""}${inRange ? " (shown)" : ""}`,
    legend: "Days with sessions",
  },
  ja: {
    triggerLabel: (heading: string) => `${heading}。日付を選んで移る`,
    isoWeekTitle: (week: string) => `ISO 週番号 第 ${week} 週`,
    monthHeading: (year: number, month: number) => `${year}年${month + 1}月`,
    prevMonth: "前の月",
    prevMonthTitle: "前の月（PageUp）",
    nextMonth: "次の月",
    nextMonthTitle: "次の月（PageDown）",
    isoWeek: "ISO 週番号",
    weekNumber: "週番号",
    dayLabel: (month: number, day: number, hasRecord: boolean, inRange: boolean) =>
      `${month + 1}月${day}日${hasRecord ? "、記録あり" : ""}${inRange ? "（表示中）" : ""}`,
    legend: "記録のある日",
  },
});
