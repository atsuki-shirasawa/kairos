import type { Recap } from "@shared/api.ts";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { summaryFailureKind } from "@/lib/drawer.ts";
import { failureHint } from "../drawer/failureHint.ts";
import { Hint } from "../Hint.tsx";
import { Markdown } from "../Markdown.tsx";

/** The LLM's summary of the project's work in the period, or a button to make one. */
export function RecapBlock({
  recap: r,
  baseUrl,
  onRecap,
}: {
  recap: Recap;
  /** Where `#123` in the recap links to, from the project's repository. */
  baseUrl: string | null;
  onRecap: () => void;
}) {
  const error = r.error && !r.pending && <RecapError error={r.error} />;
  if (r.pending) return <RecapWriting />;
  if (!r.body) return <WriteRecap onRecap={onRecap} error={error} />;
  const m = summaryMessages();
  return (
    // No surface: the project's colored rule already frames it
    <div className="mb-3 flex flex-col gap-1.5">
      <Markdown issueBaseUrl={baseUrl}>{r.body}</Markdown>
      <div className="flex flex-wrap items-center gap-x-3 text-muted-foreground text-xs">
        <Hint text={m.recapNote} focusable>
          <Sparkles className="size-3.5" role="img" aria-label={m.recapAbout} />
        </Hint>
        {r.stale && <span className="text-foreground">{m.recapStale}</span>}
        <Button variant="ghost" size="xs" className="-ml-1.5" onClick={onRecap}>
          <RefreshCw />
          {m.recapRewrite}
        </Button>
      </div>
      {error}
    </div>
  );
}

/** Why the last attempt to write the recap failed. */
function RecapError({ error }: { error: string }) {
  const m = summaryMessages();
  return (
    <div className="space-y-1 text-xs">
      <p className="text-destructive">
        {m.recapFailedHint(failureHint(summaryFailureKind(error)))}
      </p>
      <p className="break-words text-muted-foreground">{m.recapFailedDetail(error)}</p>
    </div>
  );
}

/** Shown while the recap is being written. */
function RecapWriting() {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-muted-foreground text-xs" role="status">
      <Loader2 className="size-3.5 animate-spin" />
      {summaryMessages().recapWriting}
    </p>
  );
}

/** The button to write a recap that doesn't exist yet, above any earlier failure. */
function WriteRecap({ onRecap, error }: { onRecap: () => void; error: React.ReactNode }) {
  const m = summaryMessages();
  return (
    <div className="mb-2 flex flex-col items-start gap-1">
      <Hint text={m.recapNote}>
        <Button variant="ghost" size="xs" className="-ml-2 text-muted-foreground" onClick={onRecap}>
          <Sparkles />
          {m.recapWrite}
        </Button>
      </Hint>
      {error}
    </div>
  );
}
