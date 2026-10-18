// Whose turn it was within one row of the day page: the block's turn spans cut to the day's part
// of it, as shares of its length for the strip, and how long each side had the turn.
import type { TurnWho } from "@shared/api.ts";
import type { DayBlock } from "./dayBlocks.ts";

/** One stretch of the strip, as fractions (0–1) of the block's length on this day. */
export interface TurnPiece {
  who: TurnWho;
  from: number;
  to: number;
}

/** A row's strip and the time each side had the turn on this day. */
export interface TurnShares {
  pieces: TurnPiece[];
  claudeMs: number;
  youMs: number;
}

/**
 * The block's turns on this day, or null when it has none there (logs from before turns were
 * recorded, or a block too short to draw). What has no span stays empty: it can't be told.
 */
export function turnShares(block: DayBlock): TurnShares | null {
  const from = block.dayStart + block.start;
  const to = block.dayStart + block.end;
  const length = to - from;
  if (length <= 0) return null;
  const clipped = block.segment.turns
    .map((t) => ({ who: t.who, start: Math.max(t.start, from), end: Math.min(t.end, to) }))
    .filter((t) => t.end > t.start);
  if (clipped.length === 0) return null;
  const total = (who: TurnWho) =>
    clipped.filter((t) => t.who === who).reduce((sum, t) => sum + t.end - t.start, 0);
  return {
    pieces: clipped.map((t) => ({
      who: t.who,
      from: (t.start - from) / length,
      to: (t.end - from) / length,
    })),
    claudeMs: total("claude"),
    youMs: total("you"),
  };
}
