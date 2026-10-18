import type { ImportProgress } from "@/hooks/useLiveUpdates.ts";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import { keyCap } from "@/lib/shortcuts.ts";

/**
 * The mark and the wordmark at the left end of the header. Together they are the way home, as on
 * most sites: a button rather than another control in the toolbar.
 */
export function Brand({ progress, onHome }: { progress: ImportProgress; onHome: () => void }) {
  const m = toolbarMessages();
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label={m.home}
      title={`${m.home} (${keyCap("home")})`}
      className="flex shrink-0 items-center gap-2.5 rounded-md pr-1 outline-none focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Logo progress={progress} />
      {/* The one place Syne appears: a wide geometric face, so the name reads apart from the Plex UI.
          Up to xl the mark alone stands for it, leaving the room to the controls */}
      <span className="font-mark font-semibold text-foreground text-wordmark leading-none tracking-[-0.01em] max-xl:hidden">
        Kairos
      </span>
    </button>
  );
}

/**
 * The app mark (`public/favicon.svg`; see "Components" in DESIGN.md).
 * While importing, a progress ring is drawn around it. Text would change the header width and
 * shift the buttons.
 */
function Logo({ progress }: { progress: ImportProgress }) {
  const rate = progress ? Math.min(progress.done / Math.max(progress.total, 1), 1) : 0;
  const label = progress ? toolbarMessages().importing(Math.floor(rate * 100)) : undefined;
  return (
    <span className="relative flex size-7 items-center justify-center" title={label}>
      {/* Screen readers still hear the percentage, as with the old text display */}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      {/* Reuse the favicon so the shape and color live in one place. Same color in every theme */}
      <img src="/favicon.svg" className="size-[22px]" alt="" />
      {progress && <ProgressRing rate={rate} />}
    </span>
  );
}

/** A ring around the mark, filled clockwise from the top up to `rate` (0–1). */
function ProgressRing({ rate }: { rate: number }) {
  // Circumference of radius 9. stroke-dasharray draws only the completed part
  const length = 2 * Math.PI * 9;
  return (
    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="none" strokeWidth="1.5" className="stroke-border" />
      <circle
        cx="10"
        cy="10"
        r="9"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={`${rate * length} ${length}`}
        className="stroke-primary transition-[stroke-dasharray] duration-300"
      />
    </svg>
  );
}
