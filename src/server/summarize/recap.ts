// Recaps: what was done on one project during a shown period (a month, a week or a day), in a few sentences.
// Written from the period's section summaries rather than the raw conversation, so the input stays
// small and a recap reads like the summaries it is built on. This module loads the input and
// fingerprints it; `recapPrompt.ts` turns it into the prompt.
import type { Database } from "bun:sqlite";
import { closedUndone, HAND_CLOSES, isOpenAt } from "../../shared/openItems.ts";
import type { OpenKind } from "../../shared/summaryBody.ts";
import { blockOutputsUntilSql } from "../db/blockOutputs.ts";
import { openItemsIn } from "./ledger/openItems.ts";

/** Most commit subjects a recap is given; the PRs and sections say the rest. */
const MAX_COMMITS = 40;

/** The project and period [from, to) a recap covers. Together they identify the recap. */
export interface RecapTarget {
  projectId: number;
  from: number;
  to: number;
}

/** One section as fed to a recap. */
export interface RecapSection {
  start: number;
  end: number;
  headline: string;
  /** Section summary body; null when the section has no full summary. */
  body: string | null;
}

/** An open item as a recap reads it, from the ledger. */
export interface RecapItem {
  kind: OpenKind | null;
  text: string;
  /** When the block that left it open ended. */
  openedAt: number;
  /** How it was settled ("closed #21", the summary's evidence), for settled items. */
  note: string | null;
}

/**
 * The period's open items from the ledger: those still open at its end, and those settled during
 * it (by the log, a summary or by hand). Items dismissed by hand are in neither.
 */
export interface RecapLedger {
  open: RecapItem[];
  settled: RecapItem[];
}

/** Everything a recap prompt is built from. */
export interface RecapInput {
  projectName: string;
  from: number;
  to: number;
  sections: RecapSection[];
  prs: { ref: string; title: string | null }[];
  commits: string[];
  ledger: RecapLedger;
}

/** String key for a recap target, for queue and error lookups. */
export const recapKey = (t: RecapTarget) => `${t.projectId}:${t.from}:${t.to}`;

/**
 * Sections of the project that start within [from, to), from sessions with user prompts (the same
 * ones the calendar shows), with the PRs and commits made during them. null when there are none.
 */
export function loadRecapInput(db: Database, t: RecapTarget): RecapInput | null {
  const project = db
    .query<{ name: string }, [number]>("SELECT name FROM projects WHERE id = ?")
    .get(t.projectId);
  if (!project) return null;
  const rows = db
    .query<
      {
        session_id: string;
        start: number;
        end: number;
        until: number;
        headline: string | null;
        body: string | null;
        title: string | null;
      },
      [number, number, number]
    >(
      `SELECT g.session_id, g.start, g.end,
              ${blockOutputsUntilSql("g")} AS until,
              COALESCE(sm.headline, g.fallback_title) AS headline,
              NULLIF(sm.body, '') AS body,
              COALESCE(s.custom_title, s.agent_name, s.ai_title, substr(s.first_prompt, 1, 120)) AS title
       FROM segments g
       JOIN sessions s ON s.id = g.session_id
       LEFT JOIN summaries sm ON sm.block_id = g.id
       WHERE s.project_id = ?1 AND s.prompt_count > 0 AND g.start >= ?2 AND g.start < ?3
       ORDER BY g.start, g.session_id`,
    )
    .all(t.projectId, t.from, t.to);
  if (rows.length === 0) return null;

  const { prs, commits } = collectArtifacts(db, rows);
  return {
    projectName: project.name,
    from: t.from,
    to: t.to,
    sections: rows.map((r) => ({
      start: r.start,
      end: r.end,
      headline: (r.headline ?? r.title ?? "(untitled)").split("\n")[0] ?? "",
      body: r.body,
    })),
    prs,
    commits,
    ledger: loadLedger(db, t),
  };
}

/** The project's open items for the period, split into still open and settled. */
function loadLedger(db: Database, t: RecapTarget): RecapLedger {
  const ledger: RecapLedger = { open: [], settled: [] };
  for (const e of openItemsIn(db, t.from, t.to, t.projectId)) {
    // A hand close has no note of its own; say so, or the model can't tell it from an open item
    const note = e.closedBy === HAND_CLOSES.done ? "marked done by hand" : e.closedNote;
    const item = { kind: e.kind, text: e.text, openedAt: e.openedAt, note };
    if (isOpenAt(e, t.to)) ledger.open.push({ ...item, note: null });
    else if (!closedUndone(e.closedBy)) ledger.settled.push(item);
  }
  return ledger;
}

/** PRs (first title per ref) and commit subjects made during the sections, in time order. */
function collectArtifacts(
  db: Database,
  sections: { session_id: string; start: number; until: number }[],
): Pick<RecapInput, "prs" | "commits"> {
  const artifacts = db.query<
    { kind: string; ref: string; title: string | null },
    [string, number, number]
  >(
    `SELECT kind, ref, title FROM artifacts
     WHERE session_id = ? AND kind IN ('pr', 'commit') AND is_copy = 0 AND ts BETWEEN ? AND ?
     ORDER BY ts`,
  );
  const prs = new Map<string, string | null>();
  const commits: string[] = [];
  for (const r of sections) {
    for (const a of artifacts.all(r.session_id, r.start, r.until)) {
      if (a.kind === "pr") {
        if (!prs.has(a.ref)) prs.set(a.ref, a.title);
      } else if (a.title && commits.length < MAX_COMMITS)
        commits.push(a.title.split("\n")[0] ?? "");
    }
  }
  return { prs: [...prs].map(([ref, title]) => ({ ref, title })), commits };
}

/** Fingerprint of the input. A stored recap whose hash differs was written before the work changed. */
export function recapHash(input: RecapInput): string {
  // Without items the ledger is left out, so recaps written before it existed don't all turn stale
  const { ledger, ...rest } = input;
  const empty = ledger.open.length === 0 && ledger.settled.length === 0;
  return Bun.hash(JSON.stringify(empty ? rest : input)).toString(16);
}
