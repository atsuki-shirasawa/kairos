import { Button } from "@/components/ui/button.tsx";
import { type DotLook, StatusDot } from "@/components/ui/status-dot.tsx";
import { liveMessages } from "@/i18n/messages/live.ts";
import { keyCap } from "@/lib/shortcuts.ts";
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
 * Opens Today, whose Now lists the running sessions, and says from any page how many want an
 * answer. The dot
 * pulses while a session works, like the calendar's work in progress, in `ink` since it stands
 * for every project; the count is in the warn tone, as numbers that need attention are. Pressed
 * (the `muted` fill) on Today.
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
      title={m.buttonTitle(label, keyCap("home"))}
      className={cn(
        "shrink-0 text-muted-foreground",
        active && "bg-muted text-foreground hover:bg-muted",
      )}
    >
      <StatusDot aria-hidden look={liveDot(live)} />
      {m.button}
      {live.attention > 0 && (
        <span className="font-num font-semibold text-warn">{live.attention}</span>
      )}
    </Button>
  );
}

/**
 * The button's dot: a ring when nothing runs, `ink` pulsing while a session works, `muted-ink`
 * otherwise. Not indigo, which would mark it selected, nor a project color, since it stands for
 * every project.
 */
function liveDot(live: LiveSummary): DotLook {
  if (live.running === 0) return { state: "ring" };
  return live.working ? { state: "pulse", tone: "ink" } : { state: "solid", tone: "muted" };
}
