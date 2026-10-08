// DB reads and writes for the summarizer: what a section summary is built from, which sections are
// due for an automatic summary, and saving summaries and recaps.
import type { Database } from "bun:sqlite";
import { AUTO_SUMMARY_DAYS, isSummarizable, SECTION_IDLE_MS } from "../../shared/sections.ts";
import { buildDigest, DIGEST_KINDS, type DigestMessage } from "./digest.ts";
import type { ParsedSummary, PromptInput } from "./prompt.ts";
import { type RecapInput, type RecapTarget, recapHash } from "./recap.ts";

/**
 * `summary` writes a headline and a body; `title` writes only a headline.
 * Short sections have too little in them for a body, so automatic runs give them only a headline.
 */
export type Mode = "summary" | "title";

/** A section (identified by session and start time) and how to summarize it. */
export interface Target {
  sessionId: string;
  start: number;
  mode: Mode;
}

/** A section, identified by its session and start time. */
export type SectionRef = Pick<Target, "sessionId" | "start">;

/** What a section summary is built from, and how far into the section it reaches. */
export interface SectionInput {
  /** End of the section when it was read; saved as `covered_until`. */
  end: number;
  prompt: PromptInput;
}

/** How many candidates one automatic lookup reads; enough to step past ones waiting on a retry. */
const AUTO_BATCH = 50;
/** Earlier headlines given as context; more adds length without helping the summary. */
const PREVIOUS_HEADLINES = 8;

/**
 * Recent finished sections whose summary is missing or older than the section, newest first.
 * A section is finished once it has been idle for a while or a later one exists in its session.
 * Short sections get `title` mode.
 */
export function findAutoTargets(db: Database, now: number): Target[] {
  return findTargets(db, now, {
    endedAfter: now - AUTO_SUMMARY_DAYS * 24 * 60 * 60_000,
    limit: AUTO_BATCH,
  }).map(({ project: _, ...t }) => t);
}

/** Which unsummarized sections `findTargets` returns. Omitted bounds don't narrow the search. */
export interface TargetFilter {
  /** Only sections that started at or after this time (ms). */
  startFrom?: number;
  /** Only sections that started before this time (ms). */
  startBefore?: number;
  /** Only sections that ended at or after this time (ms). */
  endedAfter?: number;
  /** Only sections that ended before this time (ms). */
  endedBefore?: number;
  /** At most this many sections. */
  limit?: number;
}

/** A section to summarize, with its project's name for showing progress. */
export interface NamedTarget extends Target {
  project: string | null;
}

/**
 * Finished sections whose summary is missing or older than the section, newest first, under the
 * same rules as automatic runs (short sections get `title` mode). Sections with no conversation to
 * summarize are left out. Shared by the automatic loop and
 * `kairos summarize`, so both agree on what still needs a summary.
 */
export function findTargets(db: Database, now: number, filter: TargetFilter = {}): NamedTarget[] {
  return db
    .query<
      {
        session_id: string;
        start: number;
        end: number;
        prompt_count: number;
        project: string | null;
      },
      [number, number, number, number, number, number]
    >(
      `SELECT g.session_id, g.start, g.end, g.prompt_count, p.name AS project
       FROM segments g
       JOIN sessions s ON s.id = g.session_id
       LEFT JOIN projects p ON p.id = s.project_id
       LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start
       WHERE s.prompt_count > 0
         AND g.end >= ?1 AND g.end < ?6
         AND g.start >= ?2 AND g.start < ?3
         AND (g.end <= ?4 OR EXISTS (SELECT 1 FROM segments later WHERE later.session_id = g.session_id AND later.start > g.start))
         AND (sm.session_id IS NULL OR sm.covered_until < g.end)
         -- Same messages as loadMessages / DIGEST_KINDS: a section with none (e.g. only scheduled
         -- runs) has nothing to summarize, and nothing is saved for it, so it would come back forever
         AND EXISTS (
           SELECT 1 FROM messages m
           WHERE m.session_id = g.session_id AND m.ts BETWEEN g.start AND g.end
             AND m.agent_id IS NULL AND m.is_copy = 0 AND m.is_scheduled = 0
             AND m.kind IN (${DIGEST_KINDS.map((k) => `'${k}'`).join(", ")})
         )
       ORDER BY g.end DESC
       LIMIT ?5`,
    )
    .all(
      filter.endedAfter ?? 0,
      filter.startFrom ?? 0,
      filter.startBefore ?? Number.MAX_SAFE_INTEGER,
      now - SECTION_IDLE_MS,
      // SQLite reads a negative LIMIT as no limit
      filter.limit ?? -1,
      filter.endedBefore ?? Number.MAX_SAFE_INTEGER,
    )
    .map((r) => ({
      sessionId: r.session_id,
      start: r.start,
      mode: isSummarizable({ start: r.start, end: r.end, promptCount: r.prompt_count })
        ? "summary"
        : "title",
      project: r.project,
    }));
}

/** The section's headline, or null when it has no summary yet. */
export function loadHeadline(db: Database, target: SectionRef): string | null {
  return (
    db
      .query<{ headline: string }, [string, number]>(
        "SELECT headline FROM summaries WHERE session_id = ? AND start = ?",
      )
      .get(target.sessionId, target.start)?.headline ?? null
  );
}

/** The section's prompt input, or null when the section is gone or has no conversation in it. */
export function loadSectionInput(db: Database, target: SectionRef): SectionInput | null {
  const end = sectionEnd(db, target);
  if (end === null) return null;
  const digest = buildDigest(loadMessages(db, target, end));
  if (!digest) return null;
  const session = loadSessionLabel(db, target.sessionId);
  return {
    end,
    prompt: {
      sessionTitle: session?.title?.split("\n")[0] ?? "(untitled)",
      projectName: session?.project ?? null,
      previous: loadPreviousHeadlines(db, target),
      digest,
    },
  };
}

/** End time of the section, or null when it no longer exists. */
function sectionEnd(db: Database, target: SectionRef): number | null {
  return (
    db
      .query<{ end: number }, [string, number]>(
        "SELECT end FROM segments WHERE session_id = ? AND start = ?",
      )
      .get(target.sessionId, target.start)?.end ?? null
  );
}

/** The session's display title and its project's name. */
function loadSessionLabel(
  db: Database,
  sessionId: string,
): { title: string | null; project: string | null } | null {
  return db
    .query<{ title: string | null; project: string | null }, [string]>(
      `SELECT COALESCE(s.custom_title, s.agent_name, s.ai_title, substr(s.first_prompt, 1, 120)) AS title,
              p.name AS project
       FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`,
    )
    .get(sessionId);
}

/** Headlines of the latest sections before this one in the same session, oldest first. */
function loadPreviousHeadlines(db: Database, target: SectionRef): string[] {
  return db
    .query<{ headline: string | null }, [string, number]>(
      `SELECT COALESCE(sm.headline, g.fallback_title) AS headline
       FROM segments g LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start
       WHERE g.session_id = ? AND g.start < ? ORDER BY g.start`,
    )
    .all(target.sessionId, target.start)
    .map((r) => r.headline)
    .filter((h): h is string => Boolean(h))
    .slice(-PREVIOUS_HEADLINES);
}

/** The main conversation's own messages in the section, leaving out subagents, copies and scheduled runs. */
function loadMessages(db: Database, target: SectionRef, end: number): DigestMessage[] {
  return db
    .query<DigestMessage, [string, number, number]>(
      `SELECT kind, text, tool_name FROM messages
       WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0 AND is_scheduled = 0
         AND ts BETWEEN ? AND ? ORDER BY file_id, seq`,
    )
    .all(target.sessionId, target.start, end);
}

/** Saves (or replaces) a section summary, recording how far into the section it reaches. */
export function saveSummary(
  db: Database,
  target: SectionRef,
  summary: ParsedSummary,
  meta: { model: string; coveredUntil: number; createdAt: number },
): void {
  db.query(
    `INSERT INTO summaries (session_id, start, headline, body, model, covered_until, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, start) DO UPDATE SET headline = excluded.headline, body = excluded.body,
       model = excluded.model, covered_until = excluded.covered_until, created_at = excluded.created_at`,
  ).run(
    target.sessionId,
    target.start,
    summary.headline,
    summary.body,
    meta.model,
    meta.coveredUntil,
    meta.createdAt,
  );
}

/** Saves (or replaces) a recap with the hash of the input it was written from. */
export function saveRecap(
  db: Database,
  t: RecapTarget,
  input: RecapInput,
  body: string,
  meta: { model: string; createdAt: number },
): void {
  db.query(
    `INSERT INTO recaps (project_id, period_from, period_to, body, model, input_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, period_from, period_to) DO UPDATE SET body = excluded.body,
       model = excluded.model, input_hash = excluded.input_hash, created_at = excluded.created_at`,
  ).run(t.projectId, t.from, t.to, body, meta.model, recapHash(input), meta.createdAt);
}
