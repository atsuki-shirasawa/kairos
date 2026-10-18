// Whose turn it was across a session: when Claude was working and when it was waiting on you,
// from its turn records, your prompts and its AskUserQuestion waits. Time the log can't tell
// (Claude done and a notification next, a turn with no turn_duration) gets no span.
import type { TurnSpan } from "../../shared/api.ts";
import { SECOND } from "../../shared/dates.ts";

/** A turn as `system/turn_duration` records it: when it ended and how long Claude worked. */
export interface TurnRow {
  end: number;
  durationMs: number;
}

/** An AskUserQuestion call: when Claude asked and when the answer (or refusal) came back. */
export interface WaitRow {
  asked: number;
  answered: number;
}

/**
 * What a session's log says about its turns. `prompts` (your prompts and slash commands) and
 * `interrupts` (Esc during a turn) are times in order.
 */
export interface TurnLog {
  turns: readonly TurnRow[];
  waits: readonly WaitRow[];
  prompts: readonly number[];
  interrupts: readonly number[];
}

/**
 * How far a turn's prompt may sit after where the turn is worked out to start: the prompt is
 * logged a few ms after the turn's start.
 */
const START_SLACK_MS = 2 * SECOND;

/**
 * The session's spans in time order. Claude's are its turns merged (background agents' turns
 * overlap the turn that started them) with the AskUserQuestion waits cut out; yours are those
 * waits and the gaps your own prompt or slash command ended. A wait or gap longer than `maxGapMs`
 * (where a work block would split) is time away, not a turn: no span.
 */
export function turnSpans(log: TurnLog, maxGapMs: number): TurnSpan[] {
  const working = mergeSpans(turnStarts(log.turns, log.waits));
  const asked = log.waits.map((w) => ({ start: w.asked, end: w.answered }));
  const claude = working.flatMap((span) => cutOut(span, asked));
  const yours = [...asked, ...yourGaps(working, log)].filter((s) => s.end - s.start <= maxGapMs);
  return normalize([
    ...claude.map((s) => ({ ...s, who: "claude" as const })),
    ...yours.map((s) => ({ ...s, who: "you" as const })),
  ]);
}

/** A start and end in epoch ms. */
interface Span {
  start: number;
  end: number;
}

/**
 * Each turn's span. A turn's `durationMs` leaves out the time Claude waited on its own
 * AskUserQuestions, so it started that much earlier than `end - durationMs`. A turn wrapping
 * another (one waiting on a background agent, which another turn ends inside) counts wall time,
 * waits included, and keeps `end - durationMs`.
 */
function turnStarts(turns: readonly TurnRow[], waits: readonly WaitRow[]): Span[] {
  const latestFirst = [...waits].sort((a, b) => b.answered - a.answered);
  const byEnd = [...turns].sort((a, b) => a.end - b.end);
  return byEnd.map((turn, i) => {
    const start = turn.end - turn.durationMs;
    // Sorted by end, the turn ending just before this one is the one that could end inside it
    const before = byEnd[i - 1];
    const wraps = before !== undefined && before.end > start && before.end < turn.end;
    return { start: wraps ? start : startBeforeWaits(start, turn.end, latestFirst), end: turn.end };
  });
}

/**
 * Where a turn began once the waits it leaves out are put back. Latest first, a wait answered
 * after the start found so far lies inside the turn and moves the start back by its length,
 * which can bring an earlier wait inside. A wait of an earlier turn was answered before this
 * turn began.
 */
function startBeforeWaits(start: number, end: number, latestFirst: readonly WaitRow[]): number {
  let begun = start;
  for (const w of latestFirst)
    if (w.answered > begun && w.answered <= end) begun -= w.answered - w.asked;
  return begun;
}

/** Overlapping or touching spans merged, in time order. */
function mergeSpans(spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** What is left of `span` once the `holes` are cut out of it. */
function cutOut(span: Span, holes: readonly Span[]): Span[] {
  let pieces = [span];
  for (const hole of holes)
    pieces = pieces.flatMap((p) =>
      hole.end <= p.start || hole.start >= p.end
        ? [p]
        : [
            { start: p.start, end: hole.start },
            { start: hole.end, end: p.end },
          ].filter((s) => s.end > s.start),
    );
  return pieces;
}

/**
 * The gaps after Claude's work that were yours: from the end of its work until the prompt that
 * began the next work, when you sent one before (or as) that work started. That prompt is the
 * last one before it, since a local slash command (/model, /cost) in between starts no turn;
 * but after an interrupt, or with no recorded work after, it is the first, as the work it began
 * left no turn record. A gap the next work began without you (a notification, a scheduled tick)
 * is left out. One pass, as `working`, `prompts` and `interrupts` are in time order.
 */
function yourGaps(working: readonly Span[], { prompts, interrupts }: TurnLog): Span[] {
  const gaps: Span[] = [];
  let p = 0;
  let k = 0;
  working.forEach((span, i) => {
    const next = working[i + 1]?.start ?? Number.POSITIVE_INFINITY;
    while (p < prompts.length && (prompts[p] as number) <= span.end) p++;
    while (k < interrupts.length && (interrupts[k] as number) <= span.end) k++;
    let last = p;
    while (last < prompts.length && (prompts[last] as number) <= next + START_SLACK_MS) last++;
    if (last === p) return;
    const interrupted = k < interrupts.length && (interrupts[k] as number) < next;
    const ended = Number.isFinite(next) && !interrupted ? prompts[last - 1] : prompts[p];
    const end = Math.min(ended as number, next);
    if (end > span.end) gaps.push({ start: span.end, end });
  });
  return gaps;
}

/**
 * Spans in time order with no two overlapping (a later one is trimmed to start where the one
 * before ends) and none empty, so each start is unique, as the table's key needs.
 */
function normalize(spans: TurnSpan[]): TurnSpan[] {
  const out: TurnSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const start = Math.max(span.start, out.at(-1)?.end ?? span.start);
    if (span.end > start) out.push({ ...span, start });
  }
  return out;
}
