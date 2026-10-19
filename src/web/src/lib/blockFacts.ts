// What the calendar says about a block in words: its time range, its tooltip's facts, and its
// commits and PRs read out to screen readers. Cards, month lines and marks share them.
import type { CalendarSession, Project } from "@shared/api.ts";
import { type OpenItem, openItemsOf } from "@shared/summaryBody.ts";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { artifactRef } from "./artifacts.ts";
import { hhmm } from "./dates.ts";
import type { PlacedBlock } from "./layout.ts";
import { blockMoments, type Moment } from "./moments.ts";
import { runCount, unitRef } from "./runUnits.ts";
import { projectLabel } from "./selection.ts";

/** "10:00–11:30", or a single time when the block starts and ends in the same minute. */
export function timeRange(block: Pick<PlacedBlock, "dayStart" | "start" | "end">): string {
  const from = hhmm(block.dayStart + block.start);
  const to = hhmm(block.dayStart + block.end);
  return from === to ? from : `${from}–${to}`;
}

/** Everything a block's tooltip says: heading, project, time and results, and why it looks as it does. */
export interface TooltipFacts {
  label: string;
  projectName: string;
  session: CalendarSession;
  range: string;
  durationMs: number;
  commits: number;
  prs: number;
  moments: Moment[];
  /** The summary's open items, counted with their kinds. */
  open: OpenItem[];
  /** An extra line under the facts, such as how to reach the runs of a burst. */
  note: string | null;
  faded: boolean;
  dim: boolean;
}

/** How a block is drawn, which its tooltip explains. */
export interface BlockLook {
  project: Project | undefined;
  /** Not matching the search or filter. */
  faded: boolean;
  /** Not summarized yet, so the heading is the block's own title (a line from its conversation). */
  dim: boolean;
}

/** The tooltip facts of one block, with the commits and PRs placed as the view draws them. */
export function tooltipFacts(
  block: PlacedBlock,
  { project, faded, dim, moments }: BlockLook & { moments: Moment[] },
): TooltipFacts {
  const { session, segment } = block;
  return {
    label: segment.headline,
    projectName: projectLabel(project),
    session,
    range: timeRange(block),
    durationMs: block.end - block.start,
    commits: segment.activity.commits,
    prs: segment.activity.prs,
    moments,
    open: openItemsOf(segment.body),
    note: null,
    faded,
    dim,
  };
}

/** How a burst of headless runs reads: its count, and the span from its first start to its last end. */
export interface BurstSpan {
  label: string;
  range: string;
  durationMs: number;
}

/**
 * The heading and span of a burst of runs (sorted by start), which the calendar's mark and the
 * day page's row both show for it. The runs of one unit of work are headed by its number.
 */
export function burstSpan(
  runs: readonly Pick<PlacedBlock, "dayStart" | "start" | "end" | "session">[],
): BurstSpan {
  const [first] = runs;
  if (!first) return { label: calendarMessages().runs(0, null), range: "", durationMs: 0 };
  // Runs can overlap, so the burst ends with whichever run ends last, not the one starting last
  const end = Math.max(...runs.map((b) => b.end));
  return {
    label: calendarMessages().runs(runCount(runs), unitRef(runs)),
    range: timeRange({ ...first, end }),
    durationMs: end - first.start,
  };
}

/**
 * The tooltip facts of a mark: one short block, or a burst of headless runs drawn as one mark
 * (`runGroups`). A burst reads as its count and sums its runs' results; it opens `lead`.
 */
export function markFacts(
  runs: PlacedBlock[],
  lead: PlacedBlock,
  look: BlockLook & { hourPx: number },
): TooltipFacts {
  const momentsOf = (b: PlacedBlock) => blockMoments(b, look.hourPx, Number.POSITIVE_INFINITY);
  const first = runs[0] ?? lead;
  if (runs.length <= 1) return tooltipFacts(first, { ...look, moments: momentsOf(first) });
  const m = calendarMessages();
  return {
    ...burstSpan(runs),
    projectName: projectLabel(look.project),
    session: first.session,
    commits: runs.reduce((sum, b) => sum + b.segment.activity.commits, 0),
    prs: runs.reduce((sum, b) => sum + b.segment.activity.prs, 0),
    moments: runs.flatMap(momentsOf),
    // A burst's runs are headless and summarized one by one, so only a single block has items
    open: [],
    note: m.runsHint,
    faded: look.faded,
    // A burst's heading is its count, not a block title waiting for a summary
    dim: false,
  };
}

/**
 * A block's commits and PRs as one line for screen readers: the first `limit` of them, then a
 * count of the rest. A busy morning can hold a dozen or more, and hearing every subject on each
 * block would bury the block's own label.
 */
export function momentsSpeech(moments: Moment[], limit: number): string {
  const m = calendarMessages();
  const more = moments.length - limit;
  return moments
    .slice(0, limit)
    .map(({ artifact: a }) =>
      m.momentAria(a.kind === "pr", a.ts !== null ? hhmm(a.ts) : "", artifactRef(a), a.title),
    )
    .concat(more > 0 ? [m.moreMoments(more)] : [])
    .join(m.momentSeparator);
}
