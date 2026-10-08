import { defineMessages } from "../index.ts";

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `month` is 0-based, as in `Date#getMonth`. */
export const dateMessages = defineMessages({
  en: {
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    weekdaysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    month: (month: number) => MONTHS_EN[month] ?? "",
    monthShort: (month: number) => (MONTHS_EN[month] ?? "").slice(0, 3),
    /** Week heading: "Oct 4 – 10" / "Sep 27 – Oct 3". The month repeats only when it changes. */
    weekRange: (fromMonth: number, fromDay: number, toMonth: number, toDay: number) =>
      `${(MONTHS_EN[fromMonth] ?? "").slice(0, 3)} ${fromDay} – ${
        toMonth === fromMonth ? "" : `${(MONTHS_EN[toMonth] ?? "").slice(0, 3)} `
      }${toDay}`,
    /** Day heading: "Oct 5". */
    monthDay: (month: number, day: number) => `${(MONTHS_EN[month] ?? "").slice(0, 3)} ${day}`,
    /** Short date: "Mon, Oct 5" / "Mon, Oct 5, 2025". */
    dateLabel: (weekday: string, month: number, day: number, year: number | null) =>
      `${weekday}, ${(MONTHS_EN[month] ?? "").slice(0, 3)} ${day}${year === null ? "" : `, ${year}`}`,
    today: "Today",
    yesterday: "Yesterday",
    minutes: (m: number) => `${m}m`,
    hours: (h: number) => `${h}h`,
    hoursMinutes: (h: number, m: number) => `${h}h ${m}m`,
  },
  ja: {
    weekdays: ["日", "月", "火", "水", "木", "金", "土"],
    weekdaysLong: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],
    month: (month: number) => `${month + 1}月`,
    monthShort: (month: number) => `${month + 1}月`,
    weekRange: (fromMonth: number, fromDay: number, toMonth: number, toDay: number) =>
      `${fromMonth + 1}月${fromDay}日 – ${toMonth === fromMonth ? "" : `${toMonth + 1}月`}${toDay}日`,
    monthDay: (month: number, day: number) => `${month + 1}月${day}日`,
    dateLabel: (weekday: string, month: number, day: number, year: number | null) =>
      `${year === null ? "" : `${year}/`}${month + 1}/${day} ${weekday}`,
    today: "今日",
    yesterday: "昨日",
    minutes: (m: number) => `${m}分`,
    hours: (h: number) => `${h}時間`,
    hoursMinutes: (h: number, m: number) => `${h}時間${m}分`,
  },
});
