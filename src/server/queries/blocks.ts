// A work block as the API shows it: the calendar's segment and the drawer's section are two views
// of the same block, so both are built here from the same row and the same facts.
import type { Database } from "bun:sqlite";
import type { Activity, CalendarSegment, Section, Usage } from "../../shared/api.ts";
import { isSummarizable } from "../../shared/sections.ts";
import { type BlockArtifacts, blockActivity } from "./activity.ts";
import { sectionHeadline, summaryBody } from "./titles.ts";
import { sessionUsage } from "./usage.ts";

/** A work block joined with its summary, if any (selected by `SECTION_SELECT`). */
export interface SectionRow {
  start: number;
  end: number;
  prompt_count: number;
  fallback_title: string | null;
  headline: string | null;
  body: string | null;
  model: string | null;
  covered_until: number | null;
  created_at: number | null;
}

/** A section and its summary, if any; callers add the WHERE and ORDER BY. */
export const SECTION_SELECT = `SELECT g.start, g.end, g.prompt_count, g.fallback_title,
         sm.headline, sm.body, sm.model, sm.covered_until, sm.created_at
  FROM segments g LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start`;

/** What was spent and done within a work block, as both the calendar and the drawer report it. */
export interface BlockFacts {
  usage: Usage | null;
  activity: Activity;
}

/** The usage and activity of the session's work block from `start` to `end`. */
export function blockFacts(
  db: Database,
  sessionId: string,
  start: number,
  end: number,
): BlockFacts {
  return {
    usage: sessionUsage(db, sessionId, start, end),
    activity: blockActivity(db, sessionId, start, end),
  };
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
    promptCount: g.prompt_count,
    headline: sectionHeadline(g, sessionTitle),
    body: summaryBody(g),
    model: g.model,
    createdAt: g.created_at,
    stale: g.covered_until !== null && g.covered_until < g.end,
    summarizable: isSummarizable({ start: g.start, end: g.end, promptCount: g.prompt_count }),
    pending: state.pending,
    error: state.error,
    usage: facts.usage,
    activity: facts.activity,
    closes: state.closes,
    opens: state.opens,
  };
}
