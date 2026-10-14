// How the summary view groups a period's open items per project: what is open at the period's
// end (recent ones apart from old ones), and what was closed during it.
import type { LedgerEntry } from "@shared/api.ts";
import { OPEN_ITEM_OLD_WEEKS } from "@shared/constants.ts";
import { WEEK } from "@shared/dates.ts";
import { isOpenAt } from "@shared/openItems.ts";
import type { OpenKind } from "@shared/summaryBody.ts";
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
 * Waiting first (it needs someone else, so it is the one to chase), then undecided points,
 * problems and things to do, then items with no kind. The newest first within a kind.
 */
const KIND_ORDER: (OpenKind | null)[] = ["waiting", "question", "issue", "todo", null];

function byKindThenNewest(a: LedgerEntry, b: LedgerEntry): number {
  return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.openedAt - a.openedAt;
}

/**
 * Whether an item counts as closed in the period's list: closed during it, or closed by hand at
 * any time since it began. A hand close is a correction, so it shows in a past period too, where
 * it is also the only place to undo it.
 */
function isClosedIn(item: LedgerEntry, from: number, to: number): boolean {
  if (item.closedAt === null || item.closedAt < from) return false;
  return item.closedAt < to || item.closedBy === "user" || item.closedBy === "dismissed";
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
    if (item.openedAt >= from) g.opened++;
    if (isClosedIn(item, from, to)) {
      g.closed.push(item);
      if ((item.closedAt ?? to) < to) g.closedIn++;
    } else if (isOpenAt(item, to)) (weekOpen(item, at) > OLD_WEEKS ? g.old : g.open).push(item);
  }
  for (const g of groups.values()) {
    g.open.sort(byKindThenNewest);
    g.old.sort(byKindThenNewest);
    g.closed.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  }
  return groups;
}

/**
 * What the log showed for an item closed by refs, in the UI language. The server writes the note
 * in fixed English phrases joined by "; " (`closeByRefs` in `summarize/ledger.ts`); each known
 * phrase is put into words here, and an unknown one is kept as written. null without a note.
 */
export function logCloses(note: string | null): string | null {
  if (!note) return null;
  const m = summaryMessages();
  const parts = note.split("; ").map((part) => {
    const issue = /^closed (#\d+)$/.exec(part);
    if (issue?.[1]) return m.logClosedIssue(issue[1]);
    const merge = /^merged PR (#\d+)$/.exec(part);
    if (merge?.[1]) return m.logMerged(merge[1]);
    const task = /^task (#\S+) completed$/.exec(part);
    if (task?.[1]) return m.logTaskDone(task[1]);
    return part;
  });
  return m.logList(parts);
}
