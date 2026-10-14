// Whether the log settles an open item: matching an item's refs against the events that close
// them. Pure, so the matching can be tested without a DB; the ledger finds the events.
import { joinCloseNotes } from "../../../shared/closeNotes.ts";
import { isClosable } from "./refs.ts";

/**
 * Something in the log that settles a ref: an issue closed, a PR merged, a task completed. Its
 * note is one of the phrases in `shared/closeNotes.ts`, which the UI reads back.
 */
export interface CloseEvent {
  ref: string;
  ts: number;
  sessionId: string;
  note: string;
}

/** How the log settled an item: the event that settled it last, and the notes of all of them. */
export interface Settlement {
  last: CloseEvent;
  note: string;
}

/**
 * How `events` settle an item opened at `openedAt` with `refs`, or null while any closable ref is
 * still unsettled (or it has none). Each ref is settled by its earliest event after the item
 * opened; the item is settled when the last of those happened.
 */
export function settlementOf(
  item: { refs: string[]; openedAt: number },
  events: CloseEvent[],
): Settlement | null {
  const settled = item.refs.filter(isClosable).map((ref) => firstEventFor(ref, item, events));
  if (settled.length === 0 || settled.some((e) => e === null)) return null;
  const all = settled as CloseEvent[];
  const last = all.reduce((a, b) => (b.ts > a.ts ? b : a));
  return { last, note: joinCloseNotes(all.map((e) => e.note)) };
}

/** The earliest event settling `ref` after the item opened (the first listed on a tie), or null. */
function firstEventFor(
  ref: string,
  item: { openedAt: number },
  events: CloseEvent[],
): CloseEvent | null {
  return events
    .filter((e) => e.ref === ref && e.ts > item.openedAt)
    .reduce<CloseEvent | null>((first, e) => (first && first.ts <= e.ts ? first : e), null);
}
