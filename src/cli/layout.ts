// Two-column layout for help pages: names on the left, explanations wrapped beside them (or under
// them on a narrow terminal).
import { type Styles, wrapWords } from "./style.ts";

/** Widest help text, even on a wide terminal: longer lines are hard to read. */
export const MAX_WIDTH = 100;
/** Below this many columns for an explanation, it moves under its name instead of beside it. */
const MIN_TEXT_WIDTH = 32;
/** A `(default: …)` closing an option's explanation. */
const TRAILING_DEFAULT = /\s*\(default: [^)]*\)$/;

/** One row of a two-column list. */
export interface ColumnRow {
  /** The name as plain text, for measuring. */
  name: string;
  /** The name as printed (with its styles). */
  styled: string;
  /** The explanation, wrapped to the room beside (or under) the name. */
  text: string;
}

/** A flag in the command color with its `<arg>` placeholder dimmed. */
export function styleFlag(flag: string, s: Styles): string {
  const at = flag.indexOf(" <");
  return at < 0 ? s.command(flag) : `${s.command(flag.slice(0, at))} ${s.dim(flag.slice(at + 1))}`;
}

/**
 * An option's explanation wrapped to `width`, with its closing `(default: …)` kept on one line
 * and dimmed, so the explanation itself stands out.
 */
export function optionText(text: string, width: number, s: Styles): string[] {
  const fallback = TRAILING_DEFAULT.exec(text)?.[0].trim();
  if (!fallback) return wrapWords(text, width);
  const unbroken = fallback.replaceAll(" ", " ");
  const lines = wrapWords(`${text.replace(TRAILING_DEFAULT, "")} ${unbroken}`, width);
  const last = lines.pop() ?? "";
  return [...lines, `${last.slice(0, -unbroken.length)}${s.dim(fallback)}`];
}

/**
 * Two columns, names and their explanations wrapped to `columns`. When the names leave too little
 * room, each explanation goes under its name instead. `nameWidth` lets several lists share one
 * column.
 */
export function twoColumns(
  rows: ColumnRow[],
  columns: number,
  wrap: (text: string, width: number) => string[],
  nameWidth = Math.max(...rows.map((r) => r.name.length)),
): string {
  const max = Math.min(columns, MAX_WIDTH);
  const stacked = max - (2 + nameWidth + 2) < MIN_TEXT_WIDTH;
  const indent = stacked ? 6 : 2 + nameWidth + 2;
  return rows
    .map(({ name, styled, text }) => {
      const [first = "", ...more] = wrap(text, max - indent);
      const head = stacked
        ? [`  ${styled}`, `${" ".repeat(indent)}${first}`]
        : [`  ${styled}${" ".repeat(nameWidth - name.length)}  ${first}`];
      return [...head, ...more.map((l) => `${" ".repeat(indent)}${l}`)].join("\n");
    })
    .join("\n");
}
