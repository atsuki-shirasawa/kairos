// Rules about open items that the server's recaps, the CLI and the web app must agree on.
import type { ClosedBy, HandClose } from "./api.ts";

/**
 * The `closed_by` each hand close records. "Mistaken" is kept apart from "dismissed" because it is
 * the one that says the summary was wrong: the false positives the summary prompt learns from.
 */
export const HAND_CLOSES = {
  done: "user",
  dismissed: "dismissed",
  mistaken: "mistaken",
} as const satisfies Record<HandClose, ClosedBy>;

/** Every `closed_by` a hand close records; only a hand edit may undo these. */
export const HAND_CLOSERS: readonly ClosedBy[] = Object.values(HAND_CLOSES);

/** Whether a value is one of the hand closes (a `PATCH /api/open-items/:id` state other than `open`). */
export function isHandClose(value: unknown): value is HandClose {
  return typeof value === "string" && Object.hasOwn(HAND_CLOSES, value);
}

/** Whether an item was closed by hand, which only a hand edit may undo. */
export function closedByHand(closedBy: ClosedBy | null): boolean {
  return closedBy !== null && HAND_CLOSERS.includes(closedBy);
}

/** Whether an item was closed without being done: set aside, or never open. Recaps leave these out. */
export function closedUndone(closedBy: ClosedBy | null): boolean {
  return closedBy === HAND_CLOSES.dismissed || closedBy === HAND_CLOSES.mistaken;
}

/**
 * Whether an item was never really open: the summary listed it by mistake. Unlike other closes, this
 * one reaches back to before it was made, so the item counts as open in no period.
 */
export function neverOpen(closedBy: ClosedBy | null): boolean {
  return closedBy === HAND_CLOSES.mistaken;
}

/**
 * Whether an open item was still open at time `t`: never closed, or closed only at or after `t`,
 * and not marked as never open.
 */
export function isOpenAt(
  item: { closedAt: number | null; closedBy: ClosedBy | null },
  t: number,
): boolean {
  if (neverOpen(item.closedBy)) return false;
  return item.closedAt === null || item.closedAt >= t;
}
