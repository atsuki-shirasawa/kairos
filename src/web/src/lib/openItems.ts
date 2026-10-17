// How the summary view groups a period's open items per project: what is open at the period's
// end (recent ones apart from old ones), and what was closed during it.
import type { LedgerEntry } from "@shared/api.ts";
import { type CloseNotePart, parseCloseNote } from "@shared/closeNotes.ts";
import { OPEN_ITEM_OLD_WEEKS } from "@shared/constants.ts";
import { WEEK } from "@shared/dates.ts";
import { closedByHand, HAND_CLOSES, isOpenAt, neverOpen } from "@shared/openItems.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";

/** An item open this many weeks or more counts as old: faded and folded away. */
export const OLD_WEEKS = OPEN_ITEM_OLD_WEEKS;

/** One project's open items for the period. */
export interface ProjectOpenItems {
  /** Open at the period's end and opened within the last `OLD_WEEKS` weeks. */
  open: LedgerEntry[];
  /** Open at the period's end but older. */
  old: LedgerEntry[];
  /** Closed during the period (or by hand since it began), most recent first. */
  closed: LedgerEntry[];
  /** How many closed during the period itself: a later hand close is listed but not counted. */
  closedIn: number;
  /** How many were left open during the period. */
  opened: number;
}

/**
 * Which week of being open an item is in at `at` (1 in its first seven days). `at` is the end of
 * the period, or now when the period is still running.
 */
export function weekOpen(item: LedgerEntry, at: number): number {
  return Math.floor(Math.max(0, at - item.openedAt) / WEEK) + 1;
}

/**
 * Newest first. Kinds are not grouped: the kind is a tag on the row, and sorting by it split the
 * list into sections that the model's loose waiting / question line made hard to read. Items one
 * summary left share `openedAt`, so they keep the order the summary listed them in (by id).
 */
function newestFirst(a: LedgerEntry, b: LedgerEntry): number {
  return b.openedAt - a.openedAt || a.id - b.id;
}

/**
 * Whether an item counts as closed in the period's list: closed during it, or closed by hand at
 * any time since it began. A hand close is a correction, so it shows in a past period too, where
 * it is also the only place to undo it.
 */
function isClosedIn(item: LedgerEntry, from: number, to: number): boolean {
  if (item.closedAt === null || item.closedAt < from) return false;
  return item.closedAt < to || closedByHand(item.closedBy);
}

/**
 * The period [from, to)'s items per project. `at` is when ages are measured: the period's end, or
 * now for a period still running. Items without a project are left out, as the summary lists open
 * items under a project's recap.
 */
export function groupOpenItems(
  items: LedgerEntry[],
  from: number,
  to: number,
  at: number,
): Map<number, ProjectOpenItems> {
  const groups = new Map<number, ProjectOpenItems>();
  for (const item of items) {
    if (item.projectId === null) continue;
    let g = groups.get(item.projectId);
    if (!g) {
      g = { open: [], old: [], closed: [], closedIn: 0, opened: 0 };
      groups.set(item.projectId, g);
    }
    if (item.openedAt >= from && !neverOpen(item.closedBy)) g.opened++;
    if (isClosedIn(item, from, to)) {
      g.closed.push(item);
      if ((item.closedAt ?? to) < to) g.closedIn++;
    } else if (isOpenAt(item, to)) (weekOpen(item, at) > OLD_WEEKS ? g.old : g.open).push(item);
  }
  for (const g of groups.values()) {
    g.open.sort(newestFirst);
    g.old.sort(newestFirst);
    g.closed.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  }
  return groups;
}

/**
 * The failed hand edit's message, when its item is one of `items`; null otherwise, so each list
 * shows only its own failure.
 */
export function failureAmong(
  items: readonly { id: number }[],
  failure: { id: number; message: string } | null,
): string | null {
  return failure && items.some((i) => i.id === failure.id) ? failure.message : null;
}

/**
 * How an item was closed, in words: what the log showed, a later block, or which hand close. Empty
 * for an item still open.
 */
export function closedHow(item: LedgerEntry): string {
  const m = summaryMessages();
  switch (item.closedBy) {
    case "ref":
      return m.closedByRef(logCloses(item.closedNote));
    case "model":
      return m.closedByModel;
    case HAND_CLOSES.done:
      return m.closedByUser;
    case HAND_CLOSES.dismissed:
      return m.closedDismissed;
    case HAND_CLOSES.mistaken:
      return m.closedMistaken;
    case null:
      return "";
  }
}

/**
 * What the log showed for an item closed by refs, in the UI language. Each phrase the server
 * stored (`shared/closeNotes.ts`) is put into words; an unknown one is kept as written. null
 * without a note.
 */
export function logCloses(note: string | null): string | null {
  if (!note) return null;
  return summaryMessages().logList(parseCloseNote(note).map(closeNotePartText));
}

function closeNotePartText(part: CloseNotePart): string {
  const m = summaryMessages();
  switch (part.kind) {
    case "issueClosed":
      return m.logClosedIssue(part.ref);
    case "prMerged":
      return m.logMerged(part.ref);
    case "taskCompleted":
      return m.logTaskDone(part.ref);
    case "unknown":
      return part.text;
  }
}
