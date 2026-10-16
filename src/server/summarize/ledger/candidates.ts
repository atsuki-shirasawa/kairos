// Which earlier open items a section summary is shown, to say which of them the section settled.
import type { Database } from "bun:sqlite";
import type { EarlierOpen } from "../prompt.ts";
import type { SectionRef } from "../target.ts";
import { predecessors, projectOf } from "./chain.ts";
import { CLOSED_BY } from "./closers.ts";
import { ITEM_SELECT, type ItemRow, itemOf, type LedgerItem } from "./items.ts";
import { isTaskRef } from "./refs.ts";

/** Most earlier items shown to the model; past it, the newest are kept. */
const MAX_CANDIDATES = 15;

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
 * Earlier open items a section may have settled: those of its own session and the sessions it
 * continues, and the project's that name an issue, PR or Jira key the section names too (task IDs
 * only mean something within one chain). Newest first, at most `MAX_CANDIDATES`.
 */
export function loadCandidates(
  db: Database,
  target: SectionRef,
  sectionRefs: string[],
): LedgerItem[] {
  const chain = predecessors(db, target.sessionId);
  const inChain = new Set(chain);
  const named = new Set(sectionRefs.filter((r) => !isTaskRef(r)));
  return openBefore(db, target, chain)
    .filter((i) => inChain.has(i.sessionId) || i.refs.some((r) => named.has(r)))
    .slice(0, MAX_CANDIDATES);
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
