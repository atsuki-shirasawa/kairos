// A thread: the sessions behind one piece of work. It is found from one session by what certainly
// ties sessions together (a continuation, a shared PR, a shared topic branch, an item one left
// open and the other closed), never by launch directory or worktree name, which clones share
// and which would make huge false threads. Only visible sessions join, and only they tie others
// in, so hidden work neither shows nor says that it links two shown sessions.
import type { Database } from "bun:sqlite";
import type { ThreadLink, ThreadTie } from "../../shared/api.ts";
import { SHARED_BRANCHES } from "../branches.ts";
import { sqlList } from "../db/sqlList.ts";
import { prUrl } from "../prUrls.ts";
import { CLOSED_BY } from "../summarize/ledger/closers.ts";

/**
 * Most sessions a thread takes in. A thread this large is rare; past it the search stops, so a
 * chain of ties through an unusually busy PR can't pull in half the history.
 */
export const THREAD_LIMIT = 40;

/**
 * How PRs tie sessions: opening or merging one. Working on one doesn't: a review session looks at
 * dozens of PRs, and through them would chain most of the history into one thread. A bare #12
 * says even less.
 */
const TYING_TOUCHES = ["opened", "merged"] as const;

/** A session one tie reaches from a member, with what the two share. */
interface TieRow {
  session_id: string;
  from_id: string;
  repo: string | null;
  number: number | null;
  branch: string | null;
}

/** The queries that find each tie, in `THREAD_TIES` order; `?1` is the members as JSON. */
function tieQueries(visible: string): Record<ThreadTie, string> {
  const members = "SELECT value FROM json_each(?1)";
  return {
    continued: `SELECT s.id AS session_id, s.started_at AS reached_start, o.id AS from_id,
                       NULL AS repo, NULL AS number,
                       NULL AS branch
                FROM sessions o JOIN sessions s ON s.continued_in = o.id OR s.id = o.continued_in
                WHERE o.id IN (${members}) AND ${visible}`,
    pr: `SELECT DISTINCT s.id AS session_id, s.started_at AS reached_start,
                g.session_id AS from_id, r.repo AS repo, r.number AS number, NULL AS branch
         FROM segments g
         JOIN block_refs r ON r.block_id = g.id AND r.how IN ${sqlList(TYING_TOUCHES)}
         JOIN block_refs r2 ON r2.repo = r.repo AND r2.number = r.number
           AND r2.how IN ${sqlList(TYING_TOUCHES)}
         JOIN segments g2 ON g2.id = r2.block_id
         JOIN sessions s ON s.id = g2.session_id
         WHERE g.session_id IN (${members}) AND ${visible}`,
    branch: `SELECT s.id AS session_id, s.started_at AS reached_start, o.id AS from_id,
                    NULL AS repo, NULL AS number, o.branch
             FROM sessions o
             JOIN sessions s ON s.project_id = o.project_id AND s.branch = o.branch
             WHERE o.id IN (${members}) AND o.branch NOT IN ${sqlList(SHARED_BRANCHES)}
               AND ${visible}`,
    item: `${itemTie("block_id", "closed_block_id", members, visible)}
           UNION ALL ${itemTie("closed_block_id", "block_id", members, visible)}`,
  };
}

/**
 * Orders a tie query's sessions oldest first (and a PR's by number), so which sessions a long
 * thread keeps, and which member and PR each comes in by, don't depend on the query plan.
 */
const IN_ORDER = "ORDER BY reached_start, session_id, number, from_id";

/**
 * Sessions an item ties to a member: through the block at the item's `other` end, from the member
 * block at its `own` end. Only a close the log showed (`ref`) ties; a summary's judgement doesn't.
 */
function itemTie(own: string, other: string, members: string, visible: string): string {
  return `SELECT s.id AS session_id, s.started_at AS reached_start, g.session_id AS from_id,
                 NULL AS repo, NULL AS number,
                 NULL AS branch
          FROM segments g
          JOIN open_items i ON i.${own} = g.id
          JOIN segments g2 ON g2.id = i.${other}
          JOIN sessions s ON s.id = g2.session_id
          WHERE g.session_id IN (${members}) AND i.closed_by = '${CLOSED_BY.ref}' AND ${visible}`;
}

/** A tie row as the API shows how a session came in. */
function linkOf(tie: ThreadTie, r: TieRow): ThreadLink {
  const pr = r.repo !== null && r.number !== null ? { repo: r.repo, number: r.number } : null;
  return {
    sessionId: r.session_id,
    from: r.from_id,
    tie,
    pr: pr && { ...pr, url: prUrl(pr) },
    branch: r.branch,
  };
}

/** A thread's members and how each came in, as the search found them. */
export interface ThreadMembers {
  ids: string[];
  links: ThreadLink[];
  truncated: boolean;
}

/**
 * The visible sessions tied to the seed, the seed first, breadth first so each comes in by the
 * shortest chain, and by the surest tie among those found at the same step. Null when the seed
 * isn't a visible session.
 */
export function threadMembers(db: Database, visible: string, seed: string): ThreadMembers | null {
  const shown = db
    .query<{ id: string }, [string]>(`SELECT s.id FROM sessions s WHERE s.id = ? AND ${visible}`)
    .get(seed);
  if (!shown) return null;
  const queries = Object.entries(tieQueries(visible)) as [ThreadTie, string][];
  const ids = [seed];
  const known = new Set(ids);
  const links: ThreadLink[] = [];
  let frontier = ids;
  while (frontier.length > 0) {
    const json = JSON.stringify(frontier);
    const next: string[] = [];
    for (const [tie, sql] of queries) {
      for (const r of db.query<TieRow, [string]>(`${sql} ${IN_ORDER}`).all(json)) {
        if (known.has(r.session_id)) continue;
        if (known.size >= THREAD_LIMIT) return { ids, links, truncated: true };
        known.add(r.session_id);
        ids.push(r.session_id);
        next.push(r.session_id);
        links.push(linkOf(tie, r));
      }
    }
    frontier = next;
  }
  return { ids, links, truncated: false };
}

/**
 * How many visible sessions are in the session's thread, itself included (at most `THREAD_LIMIT`);
 * 0 when it isn't visible.
 */
export function threadSize(db: Database, visible: string, seed: string): number {
  return threadMembers(db, visible, seed)?.ids.length ?? 0;
}
