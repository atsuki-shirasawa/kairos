import { cn } from "@/lib/utils.ts";

/**
 * A short 4px bar of how full something is (a session's context, a plan limit): `muted-ink` on
 * `input`, and `warn` when it calls for attention. Short and neutral, so it doesn't read as a
 * card's task bar, which spans the card in the project color. Decorative: the words beside it say
 * the same.
 */
export function ShareBar({ share, warn }: { share: number; warn: boolean }) {
  return (
    <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-input">
      <span
        className={cn("block h-full rounded-full", warn ? "bg-warn" : "bg-muted-foreground")}
        style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }}
      />
    </span>
  );
}
