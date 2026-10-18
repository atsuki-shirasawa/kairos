// Which earlier open items a section summary is shown, to say which of them the section settled.
import type { Database } from "bun:sqlite";
import { PICK_UP_IDLE_DAYS } from "../../../shared/constants.ts";
import { DAY } from "../../../shared/dates.ts";
import type { EarlierOpen } from "../prompt.ts";
import type { SectionRef } from "../target.ts";
import { predecessors, projectOf } from "./chain.ts";
import { CLOSED_BY } from "./closers.ts";
import { ITEM_SELECT, type ItemRow, itemOf, type LedgerItem } from "./items.ts";
import { isSharedRef } from "./refs.ts";

/** Most earlier items shown to the model; past it, the newest are kept. */
export const MAX_CANDIDATES = 15;

/**
 * Open items of the section's project and of the sessions given (its chain), opened before the
 * section started. Items this section opened, or that a model said it closed, count as not yet
 * there: regenerating the section rewrites both.
 */
function openBefore(db: Database, target: SectionRef, chain: string[]): LedgerItem[] {
  return db
    .query<ItemRow, [number, string, number, string]>(
      `${ITEM_SELECT}
       WHERE i.opened_at <= ?3
         AND NOT (g.session_id = ?2 AND g.start = ?3)
         AND (i.closed_at IS NULL
              OR (i.closed_by = '${CLOSED_BY.model}' AND c.session_id = ?2 AND c.start = ?3))
         AND (s.project_id = ?1 OR s.id IN (SELECT value FROM json_each(?4)))
       ORDER BY g.start DESC, i.id`,
    )
    .all(
      projectOf(db, target.sessionId) ?? -1,
      target.sessionId,
      target.start,
      JSON.stringify(chain),
    )
    .map(itemOf);
}

/**
 * How far back, from the section's start, another session's items that name no shared ref are
 * offered: Pick up's window, so a fresh item a later session settled can leave it.
 */
const UNTIED_ITEM_DAYS = PICK_UP_IDLE_DAYS;

/** What decides which earlier items are a section's candidates. */
export interface CandidateScope {
  /** The section's session and the sessions it continues. */
  chain: string[];
  /** The refs the section names. */
  sectionRefs: string[];
  /** The section's start. */
  start: number;
}

/**
 * Of the earlier items (newest first), the ones a section may have settled, at most
 * `MAX_CANDIDATES`. First those tied to it: its chain's, and the project's that name an issue, PR
 * or Jira key the section names too. The places left go to the project's recent items that name
 * no shared ref, which nothing else could tie to the section that settles them.
 */
export function pickCandidates(earlier: LedgerItem[], scope: CandidateScope): LedgerItem[] {
  const inChain = new Set(scope.chain);
  const named = new Set(scope.sectionRefs.filter(isSharedRef));
  const since = scope.start - UNTIED_ITEM_DAYS * DAY;
  const isTied = (i: LedgerItem) => inChain.has(i.sessionId) || i.refs.some((r) => named.has(r));
  const isUntied = (i: LedgerItem) =>
    !inChain.has(i.sessionId) && !i.refs.some(isSharedRef) && i.openedAt >= since;
  return [...earlier.filter(isTied), ...earlier.filter(isUntied)].slice(0, MAX_CANDIDATES);
}

/** The earlier open items a section may have settled (see `pickCandidates`). */
export function loadCandidates(
  db: Database,
  target: SectionRef,
  sectionRefs: string[],
): LedgerItem[] {
  const chain = predecessors(db, target.sessionId);
  return pickCandidates(openBefore(db, target, chain), { chain, sectionRefs, start: target.start });
}

/** Where an earlier item came from, as the prompt tells the model. */
function originOf(item: LedgerItem, sessionId: string): string {
  if (item.sessionId === sessionId) return "earlier in this session";
  return item.headline ? `an earlier session ("${item.headline}")` : "an earlier session";
}

/** Candidates as the prompt shows them, labeled O1, O2, … */
export function labelCandidates(items: LedgerItem[], sessionId: string): EarlierOpen[] {
  return items.map((i, n) => ({
    label: `O${n + 1}`,
    kind: i.kind,
    text: i.text,
    from: originOf(i, sessionId),
  }));
}
