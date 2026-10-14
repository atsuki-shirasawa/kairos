// The values of `open_items.closed_by`, named once so TS and SQL agree on them.
import type { ClosedBy } from "../../../shared/api.ts";

/** Each way an item can be closed, by name. */
export const CLOSED_BY = {
  /** The log shows every issue / PR / task ref settled. */
  ref: "ref",
  /** A later section's summary said it settled the item. */
  model: "model",
  /** Marked done by hand. */
  user: "user",
  /** Dismissed by hand as not to be done. */
  dismissed: "dismissed",
} as const satisfies Record<ClosedBy, ClosedBy>;

/** Every `closed_by` value; anything else in a row is not shown as a way of closing. */
export const ALL_CLOSERS: readonly ClosedBy[] = Object.values(CLOSED_BY);

/** Closes made by hand, which only a hand edit may undo. */
export const HAND_CLOSERS: readonly ClosedBy[] = [CLOSED_BY.user, CLOSED_BY.dismissed];

/** Closes a section made (by the log or its summary), which the drawer lists under that section. */
export const SECTION_CLOSERS: readonly ClosedBy[] = [CLOSED_BY.ref, CLOSED_BY.model];

/**
 * Closes that outlive regenerating the section that opened the item: a later section's summary or
 * a hand edit. The log's closes are rechecked after every save anyway.
 */
export const KEPT_CLOSERS: readonly ClosedBy[] = [CLOSED_BY.model, ...HAND_CLOSERS];

/** Whether a stored value is one of the `closed_by` values. */
export function isClosedBy(value: string | null): value is ClosedBy {
  return (ALL_CLOSERS as readonly (string | null)[]).includes(value);
}

/** A list of values as an SQL `IN (…)` operand. The values are constants, never user input. */
export function sqlList(values: readonly ClosedBy[]): string {
  return `(${values.map((v) => `'${v}'`).join(", ")})`;
}
