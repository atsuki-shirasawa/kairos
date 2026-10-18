import type { TurnWho } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { journalMessages } from "@/i18n/messages/journal.ts";
import { durationLabel } from "@/lib/dates.ts";
import type { TurnShares } from "@/lib/turns.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Whose turn it was across a block: a thin strip of its length, in the project color where Claude
 * worked and in `ink` where it waited on you, with each side's time beside it as the key.
 * What the log can't tell stays the bare track.
 */
export function TurnStrip({ turns, color }: { turns: TurnShares; color: string }) {
  const m = journalMessages();
  return (
    <div
      className="flex items-center gap-3 pt-0.5 text-meta text-muted-foreground"
      style={{ "--c": color } as React.CSSProperties}
    >
      <span
        aria-hidden
        className="relative h-1 w-full min-w-8 max-w-48 shrink overflow-hidden rounded-full bg-muted"
      >
        {turns.pieces.map((piece) => (
          <span
            key={piece.from}
            className={cn("absolute inset-y-0", SWATCH[piece.who])}
            style={{ left: `${piece.from * 100}%`, width: `${(piece.to - piece.from) * 100}%` }}
          />
        ))}
      </span>
      {showsShare(turns.claudeMs) && (
        <Share who="claude" label={m.turnClaude} ms={turns.claudeMs} />
      )}
      {showsShare(turns.youMs) && <Share who="you" label={m.turnYou} ms={turns.youMs} />}
    </div>
  );
}

/**
 * Each side's color in the strip: the project's for Claude's work, `ink` for yours. Not
 * `muted-ink`, which is all but the same grey as the tetsu project color.
 */
const SWATCH: Readonly<Record<TurnWho, string>> = { claude: "bg-(--c)", you: "bg-foreground" };

/**
 * Whether a side's time is worth a key entry: half a minute or more, as `durationLabel` would
 * round a few seconds up to "1m" and overstate it. Its sliver still shows in the strip.
 */
function showsShare(ms: number): boolean {
  return ms >= MINUTE / 2;
}

/** One side and its time, after a dot of its color in the strip. */
function Share({ who, label, ms }: { who: TurnWho; label: string; ms: number }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
      <span aria-hidden className={cn("size-1.5 self-center rounded-full", SWATCH[who])} />
      {label}
      {/* Only the time is a figure: the Japanese label is outside the condensed face */}
      <span className="font-num">{durationLabel(ms)}</span>
    </span>
  );
}
