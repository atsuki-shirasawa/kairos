import { Check, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useCopy } from "@/hooks/useCopy.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { toolbarMessages } from "@/i18n/messages/toolbar.ts";
import type { View } from "@/lib/dates.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Copies the shown period's work as Markdown, for a stand-up note or a weekly report.
 * It follows the filter, so narrowing to one project first copies only that project.
 */
export function CopyReportButton({
  view,
  report,
  hasWork,
}: {
  view: View;
  report: () => string;
  hasWork: boolean;
}) {
  const [state, copy] = useCopy();
  const label = copyLabel(view, hasWork, state);
  return (
    // A disabled button gets no tooltip, so it stays enabled and does nothing without work
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => hasWork && copy(report())}
      aria-disabled={!hasWork}
      className={cn(!hasWork && "opacity-50")}
      aria-label={label}
      title={label}
    >
      {state === "copied" ? <Check className="text-primary" /> : <ClipboardList />}
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </span>
    </Button>
  );
}

/** Where the last copy stands, as `useCopy` reports it. */
type CopyState = ReturnType<typeof useCopy>[0];

/** The button's tooltip and accessible name, which also announces how the last copy went. */
function copyLabel(view: View, hasWork: boolean, state: CopyState): string {
  const m = toolbarMessages();
  if (!hasWork) return m.nothingToReport(view);
  if (state === "copied") return m.copiedReport;
  if (state === "failed") return formatMessages().copyFailed;
  return m.copyReport(view);
}
