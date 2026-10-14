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
