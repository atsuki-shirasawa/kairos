import { Button } from "@/components/ui/button.tsx";
import { liveMessages } from "@/i18n/messages/live.ts";
import { cn } from "@/lib/utils.ts";

/** What the toolbar knows of the running sessions. */
export interface LiveSummary {
  running: number;
  /** Sessions asking or waiting for the next prompt. */
  attention: number;
  /** Whether any session is running a turn. */
  working: boolean;
}

/**
 * Opens the page of running sessions, and says from any page how many want an answer. The dot
 * pulses while a session works, like the calendar's work in progress, in `ink` since it stands
 * for every project; the count is in the warn tone, as numbers that need attention are. Pressed
 * (the `muted` fill) on that page.
 */
export function LiveButton({
  live,
  active,
  onOpen,
}: {
  live: LiveSummary;
  active: boolean;
  onOpen: () => void;
}) {
  const m = liveMessages();
  const label = m.buttonLabel(live.attention, live.running);
  return (
    <Button
      variant="ghost"
      onClick={onOpen}
      aria-pressed={active}
      aria-label={label}
      title={m.buttonTitle(label)}
      className={cn(
        "shrink-0 text-muted-foreground",
        active && "bg-muted text-foreground hover:bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          live.running === 0
            ? "border border-muted-foreground"
            : live.working
              ? "animate-pulse bg-foreground motion-reduce:animate-none"
              : "bg-muted-foreground",
        )}
      />
      {m.button}
      {live.attention > 0 && (
        <span className="font-num font-semibold text-warn">{live.attention}</span>
      )}
    </Button>
  );
}
