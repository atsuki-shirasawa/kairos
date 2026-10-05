import type { Section, SessionDetail } from "@shared/api.ts";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useRequestSummary } from "@/hooks/queries.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { summaryFailureKind } from "@/lib/drawer.ts";
import { issueBaseUrl } from "@/lib/issueLinks.ts";
import { cn } from "@/lib/utils.ts";
import { Markdown } from "../Markdown.tsx";
import { Block } from "./Block.tsx";
import { failureHint } from "./failureHint.ts";

/** Summary of the selected section, or a button to make one. Short sections say so. */
export function SectionSummary({
  session: s,
  section,
}: {
  session: SessionDetail;
  section: Section;
}) {
  const t = drawerMessages();
  const request = useRequestSummary(s.id);
  const busy = section.pending || request.isPending;
  const button = (label: string, Icon: typeof Sparkles) => (
    <SummarizeButton
      label={label}
      Icon={Icon}
      busy={busy}
      onClick={() => request.mutate(section.start)}
    />
  );

  return (
    <Block
      title={t.sectionSummary}
      emphasis
      action={section.body ? button(t.regenerate, RefreshCw) : null}
    >
      {section.body ? (
        <SummaryBody section={section} body={section.body} repo={s.project?.repo} />
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {busy ? t.summarizingNote : section.summarizable ? t.noSummaryYet : t.shortSection}
          </p>
          {!busy && button(section.summarizable ? t.summarizeNow : t.summarize, Sparkles)}
        </div>
      )}
      {section.error && !busy && <SummaryFailure error={section.error} />}
      {request.isError && <p className="mt-2 text-destructive text-xs">{request.error.message}</p>}
    </Block>
  );
}

/** Starts (or restarts) summarizing; spins and says so while a summary is on its way. */
function SummarizeButton({
  label,
  Icon,
  busy,
  onClick,
}: {
  label: string;
  Icon: typeof Sparkles;
  busy: boolean;
  onClick: () => void;
}) {
  const t = drawerMessages();
  return (
    <Button variant="outline" size="xs" onClick={onClick} disabled={busy}>
      <Icon className={cn(busy && "animate-spin motion-reduce:animate-none")} />
      {busy ? t.summarizing : label}
    </Button>
  );
}

/** The summary text, then whether it is stale and which model wrote it. */
function SummaryBody({
  section,
  body,
  repo,
}: {
  section: Section;
  body: string;
  repo: string | null | undefined;
}) {
  const t = drawerMessages();
  return (
    <>
      {/* The most-read part of the drawer, so only this gets a surface and an indigo line */}
      <div className="rounded-r-lg border-primary border-l-[3px] bg-accent/60 py-3 pr-4 pl-4">
        <Markdown
          issueBaseUrl={issueBaseUrl(repo)}
          className="text-[15px] leading-7 [&_li+li]:mt-1 [&_li>ol]:mt-1 [&_li>ul]:mt-1 [&_strong]:font-semibold"
        >
          {body}
        </Markdown>
      </div>
      <p className="mt-2 text-muted-foreground text-xs">
        {section.stale && t.staleSummary}
        {section.model && t.madeWith(section.model)}
      </p>
    </>
  );
}

/** Why the last summary attempt failed, with a suggestion of what to do about it. */
function SummaryFailure({ error }: { error: string }) {
  const t = drawerMessages();
  return (
    <div className="mt-2 space-y-1 text-xs">
      <p className="text-destructive">{t.summaryFailed(failureHint(summaryFailureKind(error)))}</p>
      <p className="break-words text-muted-foreground">{t.summaryFailedDetail(error)}</p>
    </div>
  );
}
