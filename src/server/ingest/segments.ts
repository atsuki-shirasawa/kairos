import { WORK_BLOCK_GAP_MS } from "../../shared/sections.ts";
import type { ActivityRow } from "./statements.ts";

const FALLBACK_TITLE_CHARS = 120;

/** A work block as [start, end] in epoch ms (both ends are activity times). */
export type Segment = [start: number, end: number];

/** Splits ascending times wherever the gap is longer than `gapMs`. */
export function toSegments(sortedTimes: number[], gapMs = WORK_BLOCK_GAP_MS): Segment[] {
  const segs: Segment[] = [];
  for (const t of sortedTimes) {
    const last = segs.at(-1);
    if (last && t - last[1] <= gapMs) last[1] = t;
    else segs.push([t, t]);
  }
  return segs;
}

/** A work block as stored in the segments table: its span, prompt count and fallback title. */
export interface WorkBlock {
  start: number;
  end: number;
  prompts: number;
  fallbackTitle: string | null;
}

/**
 * The work blocks drawn from a session's main-thread activity (sorted by time), split wherever
 * the gap is longer than `gapMs`. Fragments that aren't work (see `isWork`) are left out.
 */
export function workBlocks(activity: ActivityRow[], gapMs = WORK_BLOCK_GAP_MS): WorkBlock[] {
  const used = drawnActivity(activity);
  const blocks: WorkBlock[] = [];
  for (const [start, end] of toSegments(
    used.map((r) => r.ts),
    gapMs,
  )) {
    const inside = used.filter((r) => r.ts >= start && r.ts <= end);
    if (!isWork(inside)) continue;
    blocks.push({
      start,
      end,
      prompts: inside.filter(isPrompt).length,
      fallbackTitle: fallbackTitle(inside),
    });
  }
  return blocks;
}

/**
 * Activity that work blocks are drawn from. Automatic-run turns are not drawn, but a session with
 * only automatic runs uses everything, so it stays visible.
 */
export function drawnActivity(rows: ActivityRow[]): ActivityRow[] {
  const human = rows.filter((r) => r.is_scheduled === 0);
  return human.length ? human : rows;
}

/**
 * Whether a block of activity is worth drawing. A block with neither a request (a prompt, a command
 * or a `/loop` tick) nor a tool call is a fragment after a break: a compaction, an API error, or a
 * short reply to a notification. Prompt-less blocks with tool calls stay, since that is Claude
 * acting on a notification on its own, often with commits.
 */
export function isWork(inside: ActivityRow[]): boolean {
  return inside.some(
    (r) =>
      isPrompt(r) || r.kind === "sdk_prompt" || r.kind === "scheduled" || r.kind === "tool_use",
  );
}

/** Whether a row is something the user asked for (a prompt or a slash command). */
export function isPrompt(r: ActivityRow): boolean {
  return r.kind === "prompt" || r.kind === "command";
}

/**
 * Title for a work block until a summary exists: the first line of its first prompt (a typed
 * prompt preferred over a command, then the SDK input of a headless session), else of its last reply.
 */
export function fallbackTitle(inside: ActivityRow[]): string | null {
  const prompts = inside.filter(isPrompt);
  const firstPrompt =
    prompts.find((r) => r.kind === "prompt") ??
    prompts[0] ??
    inside.find((r) => r.kind === "sdk_prompt");
  const lastReply = inside.findLast((r) => r.kind === "assistant");
  return (
    (firstPrompt ?? lastReply)?.text?.trim().split("\n")[0]?.slice(0, FALLBACK_TITLE_CHARS) ?? null
  );
}

/** A work block as stored, with the id that summaries and open items reference. */
export interface StoredBlock extends WorkBlock {
  id: number;
}

/** How recomputing a session's work blocks changes the stored ones. */
export interface BlockChanges {
  /** New blocks that keep a stored block's id; their start or end may have moved. */
  kept: { id: number; block: WorkBlock }[];
  /** New blocks no stored block hands an id to. */
  added: WorkBlock[];
  /** Stored blocks folded into a kept one (`into`): their summary and open items move there. */
  merged: { id: number; into: number }[];
  /** Stored blocks no new block overlaps, gone with what referenced them. */
  dropped: number[];
}

/** A span of time, as both stored and recomputed blocks have. */
type Span = { start: number; end: number };

/**
 * How long two spans share, or -1 when they share no work. Spans that only touch share none,
 * unless one is a single moment (a block of one activity), which can only ever touch.
 */
function overlap(a: Span, b: Span): number {
  if (a.start > b.end || b.start > a.end) return -1;
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  const moment = a.start === a.end || b.start === b.end;
  return shared > 0 || moment ? shared : -1;
}

/** The index of the block that shares the most time with `stored`, or -1 when none meets it. */
function bestMatch(stored: Span, blocks: WorkBlock[]): number {
  let best = -1;
  let most = -1;
  blocks.forEach((b, i) => {
    const shared = overlap(stored, b);
    if (shared > most) [best, most] = [i, shared];
  });
  return best;
}

/**
 * Carries stored block ids over to recomputed blocks, so a block's summary and open items follow
 * it when its start or end moves. Each stored block goes to the new block it shares the most time
 * with: a split keeps the id on the larger part, and a merge keeps the oldest (lowest) id and folds
 * the others into it.
 */
export function carryIds(stored: (Span & { id: number })[], blocks: WorkBlock[]): BlockChanges {
  const claims = new Map<number, number[]>();
  const dropped: number[] = [];
  for (const s of stored) {
    const i = bestMatch(s, blocks);
    if (i < 0) dropped.push(s.id);
    else claims.set(i, [...(claims.get(i) ?? []), s.id]);
  }
  const changes: BlockChanges = { kept: [], added: [], merged: [], dropped };
  blocks.forEach((block, i) => {
    const [oldest, ...others] = (claims.get(i) ?? []).sort((a, b) => a - b);
    if (oldest === undefined) {
      changes.added.push(block);
      return;
    }
    changes.kept.push({ id: oldest, block });
    for (const id of others) changes.merged.push({ id, into: oldest });
  });
  return changes;
}

/** Whether a kept block is stored exactly as recomputed, so it needs no write. */
export function unchanged(stored: StoredBlock | undefined, block: WorkBlock): boolean {
  return (
    stored !== undefined &&
    stored.start === block.start &&
    stored.end === block.end &&
    stored.prompts === block.prompts &&
    stored.fallbackTitle === block.fallbackTitle
  );
}
