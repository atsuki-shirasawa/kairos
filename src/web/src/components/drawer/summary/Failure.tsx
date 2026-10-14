import { summaryFailureKind } from "@shared/summaryFailure.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { failureHint } from "../failureHint.ts";

/** Why the last summary attempt failed, with a suggestion of what to do about it. */
export function SummaryFailure({ error }: { error: string }) {
  const t = drawerMessages();
  return (
    <div className="mt-2 space-y-1 text-xs">
      <p className="text-destructive">{t.summaryFailed(failureHint(summaryFailureKind(error)))}</p>
      <p className="break-words text-muted-foreground">{t.summaryFailedDetail(error)}</p>
    </div>
  );
}
