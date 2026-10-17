import { Check, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useCopy } from "@/hooks/useCopy.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { resumeCommand } from "@/lib/shell.ts";

/**
 * Copies `cd <dir> && claude --resume <id>`. Looking back usually ends in picking the work up again,
 * and Kairos never runs anything itself, so the command goes to the user's own terminal.
 */
export function ResumeButton({ sessionId, cwd }: { sessionId: string; cwd: string | null }) {
  const m = formatMessages();
  const [state, copy] = useCopy();
  const label =
    state === "copied" ? m.copiedResume : state === "failed" ? m.copyFailed : m.copyResume;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => copy(resumeCommand(sessionId, cwd))}
      aria-label={label}
      title={label}
    >
      {state === "copied" ? <Check className="text-primary" /> : <SquareTerminal />}
      {/* Announce the result; the icon change alone is silent */}
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </span>
    </Button>
  );
}
