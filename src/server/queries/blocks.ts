// A work block as the API shows it: the calendar's segment and the drawer's section are two views
// of the same block, so both are built here from the same row and the same facts.
import type { Database } from "bun:sqlite";
import type { Activity, CalendarSegment, Section, Usage } from "../../shared/api.ts";
import { isSummarizable } from "../../shared/sections.ts";
import { blockOutputsUntilSql } from "../db/blockOutputs.ts";
import { STALE_SUMMARY_SQL } from "../summarize/blocks.ts";
import { type BlockArtifacts, blocksActivity } from "./activity.ts";
import type { BlockLookup, BlockSet } from "./sql.ts";
import { sectionHeadline, summaryBody } from "./titles.ts";
import { blocksTokens } from "./usage.ts";

/** A work block joined with its summary, if any (selected by `SECTION_SELECT`). */
export interface SectionRow {
  session_id: string;
  start: number;
  end: number;
  /** The last moment whose outputs (commits, PRs) the block owns (see `blockOutputsUntilSql`). */
  outputs_until: number;
  prompt_count: number;
  fallback_title: string | null;
  headline: string | null;
  short: string | null;
  body: string | null;
  model: string | null;
  created_at: number | null;
  /** 1 when the summary no longer covers the block (see `STALE_SUMMARY_SQL`). */
  stale: number;
}

/** A section and its summary, if any; `sectionRows` adds the scope. */
const SECTION_SELECT = `SELECT g.session_id, g.start, g.end,
         ${blockOutputsUntilSql("g")} AS outputs_until,
         g.prompt_count, g.fallback_title,
         sm.headline, sm.short, sm.body, sm.model, sm.created_at,
         sm.block_id IS NOT NULL AND ${STALE_SUMMARY_SQL} AS stale
  FROM segments g LEFT JOIN summaries sm ON sm.block_id = g.id`;

/** What was spent and done within a work block, as both the calendar and the drawer report it. */
export interface BlockFacts {
  usage: Usage | null;
  activity: Activity;
}

/**
 * Which work blocks a caller reads: joins after `segments g` (with `summaries sm` for the
 * sections) and a WHERE condition, with the parameters they bind. One scope selects both the
 * blocks' rows and the set their facts are counted over, so the two can't drift apart.
 */
export interface BlockScope {
  joins: string;
  where: string;
  params: (string | number)[];
}

/** The scope's blocks as the set the batched fact queries run over. */
export function blockSetOf(scope: BlockScope): BlockSet {
  return {
    sql: `SELECT g.session_id, g.start, g.end FROM segments g ${scope.joins} WHERE ${scope.where}`,
    params: scope.params,
  };
}

/** The scope's blocks with their summaries, in time order. */
export function sectionRows(db: Database, scope: BlockScope): SectionRow[] {
  return db
    .query<SectionRow, (string | number)[]>(
      `${SECTION_SELECT} ${scope.joins} WHERE ${scope.where} ORDER BY g.start`,
    )
    .all(...scope.params);
}

/**
 * The usage and activity of every block in the set, one query per kind of fact however many
 * blocks there are. This is where a block's `Activity` gets its effort, from the usage rows.
 */
export function blocksFacts(db: Database, set: BlockSet): BlockLookup<BlockFacts> {
  const tokens = blocksTokens(db, set);
  const activity = blocksActivity(db, set);
  return (sessionId, start) => ({
    usage: tokens.usage(sessionId, start),
    activity: { ...activity(sessionId, start), effort: tokens.effort(sessionId, start) },
  });
}

/** A work block as the calendar shows it, headed by the session's title when it has no other. */
export function toCalendarSegment(
  g: SectionRow,
  sessionTitle: string,
  artifacts: BlockArtifacts,
  facts: BlockFacts,
): CalendarSegment {
  return {
    start: g.start,
    end: g.end,
    headline: sectionHeadline(g, sessionTitle),
    short: g.short,
    summarized: g.headline !== null,
    body: summaryBody(g),
    prs: artifacts.prs,
    commits: artifacts.commits,
    promptCount: g.prompt_count,
    usage: facts.usage,
    activity: facts.activity,
  };
}

/** Where a section's summary run stands, and the open items the section left and closed. */
export interface SectionState {
  pending: boolean;
  error: string | null;
  closes: Section["closes"];
  opens: Section["opens"];
}

/** A work block as the drawer shows it, with its summary's state. */
export function toSection(
  g: SectionRow,
  sessionTitle: string,
  state: SectionState,
  facts: BlockFacts,
): Section {
  return {
    start: g.start,
    end: g.end,
    outputsUntil: g.outputs_until,
    promptCount: g.prompt_count,
    headline: sectionHeadline(g, sessionTitle),
    short: g.short,
    body: summaryBody(g),
    model: g.model,
    createdAt: g.created_at,
    stale: g.stale === 1,
    summarizable: isSummarizable({ start: g.start, end: g.end, promptCount: g.prompt_count }),
    pending: state.pending,
    error: state.error,
    usage: facts.usage,
    activity: facts.activity,
    closes: state.closes,
    opens: state.opens,
  };
}
