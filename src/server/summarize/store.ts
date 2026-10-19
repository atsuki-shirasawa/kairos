// DB reads and writes for the summarizer: what a section summary is built from, which sections are
// due for an automatic summary, and saving summaries (with their ledger update) and recaps.
import type { Database } from "bun:sqlite";
import { DAY } from "../../shared/dates.ts";
import { AUTO_SUMMARY_DAYS, isSummarizable, SECTION_IDLE_MS } from "../../shared/sections.ts";
import { sqlList } from "../db/sqlList.ts";
import { refsOf } from "../refs.ts";
import { automationSql, headlessSql, RUN_KINDS, type RunKind } from "../runKinds.ts";
import type { TaskState } from "../tasks.ts";
import { DEFAULT_HIDDEN_CWDS, visibleSessionSql } from "../visibility.ts";
import { STALE_SUMMARY_SQL, sectionBlock, stillStartsAt } from "./blocks.ts";
import type { RunStats } from "./claude.ts";
import { buildDigest, DIGEST_KINDS, type DigestMessage } from "./digest.ts";
import { formatFacts, loadFacts } from "./facts.ts";
import { type LedgerUpdate, recordSection } from "./ledger/record.ts";
import { PROMPT_VERSION, type PromptInput, type UnitContext } from "./prompt.ts";
import { type RecapInput, type RecapTarget, recapHash } from "./recap.ts";
import { type Mode, modeOf, type SectionRef, type SectionSize, type Target } from "./target.ts";

/** What a section summary is built from, and how far into the section it reaches. */
export interface SectionInput {
  /** The section's block when it was read; the summary is saved only while it still starts there. */
  blockId: number;
  /** End of the section when it was read; saved as `covered_until`. */
  end: number;
  prompt: PromptInput;
  /** Issues, PRs, Jira keys and tasks the section names, to find earlier open items about them. */
  refs: string[];
  /** Tasks in the session at the section's end, to tie open items to the tasks they name. */
  tasks: TaskState[];
}

/** How many candidates one automatic lookup reads; enough to step past ones waiting on a retry. */
const AUTO_BATCH = 50;
/**
 * How many of an automation run's first tool results its digest quotes: a loop reads its
 * assignment in the first call or two, and later results are the work's own detail.
 */
const AUTOMATION_LEADING_RESULTS = 3;
/** Earlier headlines given as context; more adds length without helping the summary. */
const PREVIOUS_HEADLINES = 8;

/**
 * Recent finished sections whose summary is missing or older than the section, newest sessions
 * first and each session's sections in order.
 * A section is finished once it has been idle for a while or a later one exists in its session.
 * Short sections get `title` mode.
 */
export function findAutoTargets(db: Database, now: number): Target[] {
  return findTargets(db, now, {
    endedAfter: now - AUTO_SUMMARY_DAYS * DAY,
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
  /** Launch directories never summarized (default: Kairos's own summarizer directory). */
  hiddenCwds?: readonly string[];
}

/** A section to summarize, with its project's name for showing progress. */
export interface NamedTarget extends Target {
  project: string | null;
}

/**
 * Whether the section aliased `g` is finished: idle since `idleBefore` (a bound parameter), or
 * followed by a later section of its session.
 */
function finishedSql(idleBefore: string): string {
  return `(g.end <= ${idleBefore} OR EXISTS (SELECT 1 FROM segments later WHERE later.session_id = g.session_id AND later.start > g.start))`;
}

/**
 * The messages aliased `m` that the summary reads of the section aliased `g`: the main
 * conversation's own, leaving out subagents, copies and scheduled runs, as `loadMessages` does.
 */
const SECTION_MESSAGES_SQL = `m.session_id = g.session_id AND m.ts BETWEEN g.start AND g.end
    AND m.agent_id IS NULL AND m.is_copy = 0 AND m.is_scheduled = 0`;

/**
 * Whether the section aliased `g` has a conversation to summarize: the same messages as
 * loadMessages / DIGEST_KINDS. A section with none (e.g. only scheduled runs) gets nothing saved,
 * so it would come back forever.
 */
const HAS_CONVERSATION_SQL = `EXISTS (
  SELECT 1 FROM messages m
  WHERE ${SECTION_MESSAGES_SQL} AND m.kind IN ${sqlList(DIGEST_KINDS)}
)`;

/**
 * The tool calls `modeOf` counts in the section aliased `g` of the session aliased `s`. Only an
 * automation run's mode reads its calls, so only its sections count them.
 */
const TOOL_CALLS_SQL = `CASE WHEN ${automationSql("s")} THEN (
    SELECT COUNT(*) FROM messages m WHERE ${SECTION_MESSAGES_SQL} AND m.kind = 'tool_use'
  ) ELSE 0 END`;

/** A full summary in the old format (free Markdown, before `PROMPT_VERSION`), aliased `sm`. */
const OLD_FORMAT_SQL = "(sm.prompt_version IS NULL AND sm.body <> '')";

/**
 * Finished sections whose summary is missing or older than the section, newest sessions first and
 * each session's sections in order, under the
 * same rules as automatic runs (`modeOf`: short sections and trial runs get `title` mode). Sections with no conversation to
 * summarize are left out. Trial runs are summarized whether or not the calendar shows them, so
 * their summaries are ready when they are turned on. Shared by the automatic loop and
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
        run_kind: RunKind | null;
        tool_calls: number;
        project: string | null;
      },
      [number, number, number, number, number, number]
    >(
      `SELECT g.session_id, g.start, g.end, g.prompt_count, s.run_kind, p.name AS project,
         ${TOOL_CALLS_SQL} AS tool_calls
       FROM segments g
       JOIN sessions s ON s.id = g.session_id
       LEFT JOIN projects p ON p.id = s.project_id
       LEFT JOIN summaries sm ON sm.block_id = g.id
       WHERE ${visibleSessionSql({ runs: "all", hiddenCwds: hiddenCwdsOf(filter) })}
         AND g.end >= ?1 AND g.end < ?6
         AND g.start >= ?2 AND g.start < ?3
         AND ${finishedSql("?4")}
         AND (sm.block_id IS NULL OR ${STALE_SUMMARY_SQL})
         AND ${HAS_CONVERSATION_SQL}
       -- Newest sessions first, but a session's sections in order: a section can only report
       -- settling an open item (the ledger) when the section that left it was summarized before
       -- (the session's last section overall, so a narrowed search keeps the same order)
       ORDER BY (SELECT MAX(x.end) FROM segments x WHERE x.session_id = g.session_id) DESC,
         g.session_id, g.start
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
    .map((r) => namedTarget(r, modeOf(sectionSize(r))));
}

/** A section row with what `modeOf` reads. */
interface SizedRow {
  start: number;
  end: number;
  prompt_count: number;
  run_kind: RunKind | null;
  tool_calls: number;
}

/** What `modeOf` looks at, from a section row. */
function sectionSize(r: SizedRow): SectionSize {
  return {
    start: r.start,
    end: r.end,
    promptCount: r.prompt_count,
    toolCalls: r.tool_calls,
    runKind: r.run_kind,
  };
}

/** A section row (its session, start and project's name) as a target in `mode`. */
function namedTarget(
  r: { session_id: string; start: number; project: string | null },
  mode: Target["mode"],
): NamedTarget {
  return { sessionId: r.session_id, start: r.start, mode, project: r.project };
}

/**
 * Why a summary is regenerated: it is in the old format (`old-format`), it follows one in its
 * session (`after-old-format`), it is a headless run's from an older `PROMPT_VERSION`
 * (`older-prompt`), or it is an automation run's headline where a full summary is due now
 * (`headline-only`, a run once taken for a trial).
 */
export type RegenerateReason = "old-format" | "after-old-format" | "older-prompt" | "headline-only";

/** A summary to regenerate, and why. */
export interface RegenerateTarget extends NamedTarget {
  reason: RegenerateReason;
}

/**
 * Which summaries the regenerate lookups cover. Omitted bounds don't narrow the search;
 * `headlessOnly` (read by `findRegenerations`) leaves people's sessions out.
 */
export interface RegenerateFilter
  extends Pick<TargetFilter, "startFrom" | "startBefore" | "limit" | "hiddenCwds"> {
  headlessOnly?: boolean;
}

/** A summary written by an older prompt than the current one (null before versions), aliased `sm`. */
const OLDER_PROMPT_SQL = `(COALESCE(sm.prompt_version, 0) < ${PROMPT_VERSION})`;

/** Summarized sections (`sm`, `g`) with their session (`s`) and project (`p`). */
const SUMMARIZED_SECTIONS_SQL = `summaries sm
       JOIN segments g ON g.id = sm.block_id
       JOIN sessions s ON s.id = g.session_id
       LEFT JOIN projects p ON p.id = s.project_id`;

/**
 * What every regenerated section meets: started in [?1, ?2), finished by ?3, and with a
 * conversation to summarize. Bound with `rangeParams`.
 */
const REGENERABLE_SQL = `g.start >= ?1 AND g.start < ?2
         AND ${finishedSql("?3")} AND ${HAS_CONVERSATION_SQL}`;

/** The bindings of `REGENERABLE_SQL`. */
function rangeParams(filter: RegenerateFilter, now: number): [number, number, number] {
  return [
    filter.startFrom ?? 0,
    filter.startBefore ?? Number.MAX_SAFE_INTEGER,
    now - SECTION_IDLE_MS,
  ];
}

/** The launch directories a lookup leaves out: the filter's, else Kairos's own. */
function hiddenCwdsOf(filter: Pick<TargetFilter, "hiddenCwds">): readonly string[] {
  return filter.hiddenCwds ?? DEFAULT_HIDDEN_CWDS;
}

/** The regenerate lookups' order (`ORDER BY g.start, g.session_id`), compared as SQLite does. */
function byStartThenSession(a: RegenerateTarget, b: RegenerateTarget): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.sessionId === b.sessionId) return 0;
  return a.sessionId < b.sessionId ? -1 : 1;
}

/**
 * Every summary `kairos summarize --old-format` regenerates, oldest first: people's sessions in the
 * old format (`findOldFormat`, unless `headlessOnly`) and headless runs from an older prompt
 * (`findOutdatedRuns`).
 */
export function findRegenerations(
  db: Database,
  now: number,
  filter: RegenerateFilter = {},
): RegenerateTarget[] {
  const { limit, headlessOnly, ...range } = filter;
  const people = headlessOnly ? [] : findOldFormat(db, now, range);
  return [...people, ...findOutdatedRuns(db, now, range)].sort(byStartThenSession).slice(0, limit);
}

/**
 * The full summaries to regenerate so old sections reach the open-items ledger, oldest first: each
 * finished section summarized in the old format (free Markdown, nothing in the ledger), and every
 * full summary after it in the same session. Regenerated in this order, a later section settles
 * what an earlier one left open; a later summary written before its earlier sections were in the
 * ledger couldn't have. Human sessions only, like the ledger's lists; sections now too short for a
 * full summary are left as they are.
 */
export function findOldFormat(
  db: Database,
  now: number,
  filter: RegenerateFilter = {},
): RegenerateTarget[] {
  const rows = db
    .query<
      {
        session_id: string;
        start: number;
        end: number;
        prompt_count: number;
        project: string | null;
        old_format: number;
      },
      [number, number, number]
    >(
      `SELECT g.session_id, g.start, g.end, g.prompt_count, p.name AS project,
         ${OLD_FORMAT_SQL} AS old_format
       FROM ${SUMMARIZED_SECTIONS_SQL}
       WHERE ${visibleSessionSql({ runs: "people", hiddenCwds: hiddenCwdsOf(filter) })}
         AND sm.body <> '' AND ${REGENERABLE_SQL}
         AND EXISTS (
           SELECT 1 FROM segments first
           JOIN summaries sm ON sm.block_id = first.id
           WHERE first.session_id = g.session_id AND first.start <= g.start
             AND first.start >= ?1 AND ${OLD_FORMAT_SQL})
       ORDER BY g.start, g.session_id`,
    )
    .all(...rangeParams(filter, now));
  return rows
    .filter((r) => isSummarizable({ start: r.start, end: r.end, promptCount: r.prompt_count }))
    .slice(0, filter.limit)
    .map((r) => ({
      ...namedTarget(r, "summary"),
      reason: r.old_format === 1 ? "old-format" : "after-old-format",
    }));
}

/** What `runRegeneration` reads of a headless run's summary. */
export interface StoredRunSummary {
  /** Written by an older `PROMPT_VERSION` than the current one. */
  olderPrompt: boolean;
  /** Only a headline, no body. */
  headlineOnly: boolean;
}

/** A headless run's summary to write again: why, and in which mode. */
export interface RunRegeneration {
  reason: RegenerateReason;
  mode: Mode;
}

/**
 * Whether a headless run's summary is due again, given the mode `modeOf` gives its section now:
 * an older prompt wrote it, or it is a headline where a full summary is due. A summary that has a
 * body keeps one (it may have been asked for from the drawer), so only a headline-only summary
 * takes a `title` mode. Null when it is current.
 */
export function runRegeneration(stored: StoredRunSummary, modeNow: Mode): RunRegeneration | null {
  const mode = stored.headlineOnly ? modeNow : "summary";
  if (stored.olderPrompt) return { reason: "older-prompt", mode };
  if (stored.headlineOnly && modeNow === "summary") return { reason: "headline-only", mode };
  return null;
}

/**
 * Headless runs' summaries to write again, oldest first, so each session's sections come in order
 * and a later one sees the earlier headlines: every one from an older `PROMPT_VERSION` (written
 * before the headline checks and an automation run's own context), and an automation run's
 * headline where `modeOf` now gives a full summary, because its directory was taken for trials
 * until a later run came back (see `runRegeneration`). A headline is regenerated in the mode
 * `modeOf` gives now, so a trial run keeps a headline only; a full summary stays one. Summaries
 * older than their section are left to `findTargets`, which the running server shares.
 */
export function findOutdatedRuns(
  db: Database,
  now: number,
  filter: RegenerateFilter = {},
): RegenerateTarget[] {
  const rows = db
    .query<
      SizedRow & {
        session_id: string;
        project: string | null;
        older: number;
        headline_only: number;
      },
      [number, number, number]
    >(
      `SELECT g.session_id, g.start, g.end, g.prompt_count, s.run_kind, p.name AS project,
         ${TOOL_CALLS_SQL} AS tool_calls,
         ${OLDER_PROMPT_SQL} AS older, sm.body = '' AS headline_only
       FROM ${SUMMARIZED_SECTIONS_SQL}
       WHERE ${headlessSql("s")}
         AND ${visibleSessionSql({ runs: "all", hiddenCwds: hiddenCwdsOf(filter) })}
         AND ${REGENERABLE_SQL}
         -- A summary older than its section is findTargets' to redo, the server's for recent days
         AND NOT ${STALE_SUMMARY_SQL}
         -- The candidates runRegeneration picks from; only the mode is left to decide in code
         AND (${OLDER_PROMPT_SQL} OR (sm.body = '' AND ${automationSql("s")}))
       ORDER BY g.start, g.session_id`,
    )
    .all(...rangeParams(filter, now));
  return rows
    .flatMap((row) => {
      const due = runRegeneration(
        { olderPrompt: row.older === 1, headlineOnly: row.headline_only === 1 },
        modeOf(sectionSize(row)),
      );
      return due ? [{ ...namedTarget(row, due.mode), reason: due.reason }] : [];
    })
    .slice(0, filter.limit);
}

/** The section's headline, or null when it has no summary yet. */
export function loadHeadline(db: Database, target: SectionRef): string | null {
  return (
    db
      .query<{ headline: string }, [string, number]>(
        `SELECT sm.headline FROM summaries sm JOIN segments g ON g.id = sm.block_id
         WHERE g.session_id = ? AND g.start = ?`,
      )
      .get(target.sessionId, target.start)?.headline ?? null
  );
}

/** The section's prompt input, or null when the section is gone or has no conversation in it. */
export function loadSectionInput(db: Database, target: SectionRef): SectionInput | null {
  const block = sectionBlock(db, target);
  if (!block) return null;
  const { id: blockId, end } = block;
  const session = loadSessionLabel(db, target.sessionId);
  const automated = session?.run_kind === RUN_KINDS.automation;
  const previous = loadPreviousHeadlines(db, target);
  const unit = automated && session ? loadUnitContext(db, session, target) : undefined;
  // A run reads its assignment at its start, so only its first section quotes what it read
  const quotesInputs = automated && previous.length === 0;
  const digest = buildDigest(loadMessages(db, target, end), {
    leadingResults: quotesInputs ? AUTOMATION_LEADING_RESULTS : 0,
  });
  if (!digest) return null;
  const facts = loadFacts(db, target.sessionId, target.start, end);
  const factsText = formatFacts(facts);
  return {
    blockId,
    end,
    prompt: {
      sessionTitle: session?.title?.split("\n")[0] ?? "(untitled)",
      projectName: session?.project ?? null,
      automated,
      previous,
      ...(unit ? { unit } : {}),
      facts: factsText,
      digest,
    },
    refs: refsOf(`${factsText}\n${digest}`),
    tasks: facts.tasks,
  };
}

/**
 * A session as a summary prompt names it: its title, its project, what kind of run it is, and the
 * unit of work it belongs to.
 */
interface SessionLabel {
  title: string | null;
  project: string | null;
  run_kind: RunKind | null;
  run_unit: string | null;
  run_unit_ref: number | null;
}

/** The session's display title, its project's name and its run kind. */
function loadSessionLabel(db: Database, sessionId: string): SessionLabel | null {
  return db
    .query<SessionLabel, [string]>(
      `SELECT COALESCE(s.custom_title, s.agent_name, s.ai_title, substr(s.first_prompt, 1, 120)) AS title,
              p.name AS project, s.run_kind, s.run_unit, s.run_unit_ref
       FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?`,
    )
    .get(sessionId);
}

/** Headlines of the latest sections before this one in the same session, oldest first. */
function loadPreviousHeadlines(db: Database, target: SectionRef): string[] {
  const rows = db
    .query<{ headline: string | null }, [string, number]>(
      `SELECT COALESCE(sm.headline, g.fallback_title) AS headline
       FROM segments g LEFT JOIN summaries sm ON sm.block_id = g.id
       WHERE g.session_id = ? AND g.start < ? ORDER BY g.start`,
    )
    .all(target.sessionId, target.start);
  return latestHeadlines(rows);
}

/** The latest `PREVIOUS_HEADLINES` of blocks' headlines (oldest first), leaving out blocks with none. */
function latestHeadlines(rows: { headline: string | null }[]): string[] {
  return rows
    .map((r) => r.headline)
    .filter((h): h is string => Boolean(h))
    .slice(-PREVIOUS_HEADLINES);
}

/**
 * The unit of work the section's run continues: headlines of the latest sections of its unit's
 * other runs that started before it, oldest first. Undefined when the run is in no unit or is the
 * unit's first.
 */
function loadUnitContext(
  db: Database,
  session: SessionLabel,
  target: SectionRef,
): UnitContext | undefined {
  if (session.run_unit === null || session.run_unit_ref === null) return undefined;
  const rows = db
    .query<{ headline: string | null }, [string, string, number]>(
      `SELECT COALESCE(sm.headline, g.fallback_title) AS headline
       FROM sessions s JOIN segments g ON g.session_id = s.id
       LEFT JOIN summaries sm ON sm.block_id = g.id
       WHERE s.run_unit = ? AND s.id != ? AND g.start < ? ORDER BY g.start`,
    )
    .all(session.run_unit, target.sessionId, target.start);
  const earlier = latestHeadlines(rows);
  return earlier.length ? { ref: session.run_unit_ref, earlier } : undefined;
}

/** The main conversation's own messages in the section, leaving out subagents, copies and scheduled runs. */
function loadMessages(db: Database, target: SectionRef, end: number): DigestMessage[] {
  return db
    .query<DigestMessage, [string, number, number]>(
      `SELECT kind, text, tool_name, tool_use_id, is_error FROM messages
       WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0 AND is_scheduled = 0
         AND ts BETWEEN ? AND ? ORDER BY file_id, seq`,
    )
    .all(target.sessionId, target.start, end);
}

/** How far a saved summary reaches: the section's span when it was read. */
interface Coverage {
  from: number;
  until: number;
}

/** A summary's text: its headline, the short title for week blocks, and its Markdown body. */
export interface SummaryText {
  headline: string;
  /** Null for a summary written before short titles, or when the model gave none. */
  short: string | null;
  body: string;
}

/** How a summary was written: which prompt, from which input, and what it cost. */
export interface SummaryRun extends RunStats {
  /** `PROMPT_VERSION` of the prompt that wrote it. */
  promptVersion: number;
  /** Hash of the prompt, so summaries written from the same input can be told apart. */
  inputHash: string;
}

/**
 * Saves (or replaces) a block's summary, recording the span of the section it was written from and,
 * when the model wrote it, how (a summary put in by other means leaves those columns null).
 */
export function saveSummary(
  db: Database,
  blockId: number,
  summary: SummaryText,
  meta: { model: string; covered: Coverage; createdAt: number; run?: SummaryRun },
): void {
  db.query(
    `INSERT INTO summaries (block_id, headline, short, body, model, covered_from, covered_until,
       created_at, prompt_version, input_hash, input_tokens, output_tokens, cost_usd, latency_ms)
     VALUES ($blockId, $headline, $short, $body, $model, $from, $until, $createdAt, $promptVersion,
       $inputHash, $inputTokens, $outputTokens, $costUsd, $latencyMs)
     ON CONFLICT(block_id) DO UPDATE SET headline = excluded.headline, short = excluded.short,
       body = excluded.body, model = excluded.model, covered_from = excluded.covered_from,
       covered_until = excluded.covered_until, created_at = excluded.created_at,
       prompt_version = excluded.prompt_version, input_hash = excluded.input_hash,
       input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
       cost_usd = excluded.cost_usd, latency_ms = excluded.latency_ms`,
  ).run({
    blockId,
    headline: summary.headline,
    short: summary.short,
    body: summary.body,
    model: meta.model,
    from: meta.covered.from,
    until: meta.covered.until,
    createdAt: meta.createdAt,
    promptVersion: meta.run?.promptVersion ?? null,
    inputHash: meta.run?.inputHash ?? null,
    inputTokens: meta.run?.inputTokens ?? null,
    outputTokens: meta.run?.outputTokens ?? null,
    costUsd: meta.run?.costUsd ?? null,
    latencyMs: meta.run?.latencyMs ?? null,
  });
}

/** What a section summary saves: the summary itself and its change to the ledger. */
export interface SectionResult {
  /** The block the section was read from (`SectionInput.blockId`). */
  blockId: number;
  summary: SummaryText;
  run: SummaryRun;
  ledger: LedgerUpdate;
}

/**
 * Saves a section's summary and applies it to the ledger in one transaction, so the summary and
 * the open items it recorded never disagree. The summary reaches as far as the ledger update's end.
 * Returns false, saving nothing, when the block it was read from no longer starts where it did
 * (its log changed while the model ran); the block is then due again as it is now.
 */
export function saveSection(
  db: Database,
  target: SectionRef,
  result: SectionResult,
  meta: { model: string; createdAt: number },
): boolean {
  return db.transaction(() => {
    const { blockId } = result;
    if (!stillStartsAt(db, blockId, target.start)) return false;
    const covered = { from: target.start, until: result.ledger.end };
    saveSummary(db, blockId, result.summary, { ...meta, covered, run: result.run });
    recordSection(db, { ...target, blockId }, result.ledger);
    return true;
  })();
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
