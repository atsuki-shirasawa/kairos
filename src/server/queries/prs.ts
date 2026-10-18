// One PR's work across sessions: the work blocks that touched it, and what their refs say of it.
import type { Database } from "bun:sqlite";
import {
  PR_TOUCHES,
  type PrBlock,
  type PrHistory,
  type PrRef,
  type PrTouch,
} from "../../shared/api.ts";
import { prUrl } from "../prUrls.ts";
import { sectionHeadline, type TitleSource, title } from "./titles.ts";

/** One ref of a block that touched the PR, with what the block's headline falls back to. */
interface PrRefRow extends TitleSource {
  block_id: number;
  session_id: string;
  project_id: number | null;
  label: string | null;
  start: number;
  end: number;
  headline: string | null;
  fallback_title: string | null;
  how: PrTouch;
  ts: number | null;
  ref_title: string | null;
}

/** The refs of visible blocks that touched the PR, in block order. */
function prRefRows(db: Database, visible: string, pr: PrRef): PrRefRow[] {
  return db
    .query<PrRefRow, [string, number]>(
      `SELECT g.id AS block_id, g.session_id, s.project_id, s.label, g.start, g.end, sm.headline,
              g.fallback_title, s.custom_title, s.agent_name, s.ai_title, s.first_prompt,
              r.how, r.ts, r.title AS ref_title
       FROM block_refs r
       JOIN segments g ON g.id = r.block_id
       JOIN sessions s ON s.id = g.session_id
       LEFT JOIN summaries sm ON sm.block_id = g.id
       WHERE r.repo = ? AND r.number = ? AND ${visible}
       ORDER BY g.start, g.id`,
    )
    .all(pr.repo, pr.number);
}

/** The blocks, each once with every way it touched the PR (in `PR_TOUCHES` order). */
function prBlocks(rows: PrRefRow[]): PrBlock[] {
  const byBlock = new Map<number, { row: PrRefRow; how: Set<PrTouch> }>();
  for (const row of rows) {
    const block = byBlock.get(row.block_id) ?? { row, how: new Set<PrTouch>() };
    block.how.add(row.how);
    byBlock.set(row.block_id, block);
  }
  return [...byBlock.values()].map(({ row, how }) => ({
    sessionId: row.session_id,
    projectId: row.project_id,
    label: row.label,
    start: row.start,
    end: row.end,
    headline: sectionHeadline(row, title(row)),
    how: PR_TOUCHES.filter((t) => how.has(t)),
  }));
}

/** The earliest time of the refs of one kind, or null when none has it. */
function firstAt(rows: PrRefRow[], how: PrTouch): number | null {
  const times = rows.flatMap((r) => (r.how === how && r.ts !== null ? [r.ts] : []));
  return times.length ? Math.min(...times) : null;
}

/**
 * The PR's history: the blocks of visible sessions that touched it, oldest first, and what their
 * refs say of it (the title it was first opened with, when it was first opened and merged). Null
 * when no visible block touched it, so work in hidden sessions (headless runs, hidden
 * directories) neither shows nor says the PR exists.
 */
export function prHistory(db: Database, visible: string, pr: PrRef): PrHistory | null {
  const rows = prRefRows(db, visible, pr);
  if (rows.length === 0) return null;
  const opened = rows
    .filter((r) => r.how === "opened" && r.ref_title !== null)
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return {
    ...pr,
    url: prUrl(pr),
    title: opened[0]?.ref_title ?? null,
    openedAt: firstAt(rows, "opened"),
    mergedAt: firstAt(rows, "merged"),
    blocks: prBlocks(rows),
  };
}
