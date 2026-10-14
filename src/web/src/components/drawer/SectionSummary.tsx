import type { Section, SessionDetail } from "@shared/api.ts";
import { parseSummaryBody } from "@shared/summaryBody.ts";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useRequestSummary } from "@/hooks/queries.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { summaryOutcomeNode } from "@/lib/drawer.ts";
import { modelLabel } from "@/lib/format.ts";
import { issueBaseUrl } from "@/lib/issueLinks.ts";
import { cn } from "@/lib/utils.ts";
import { Block } from "./Block.tsx";
import { Closes } from "./summary/Closes.tsx";
import { SummaryFailure } from "./summary/Failure.tsx";
import { StructuredSummary } from "./summary/Structured.tsx";
import { SummaryMarkdown } from "./summary/SummaryText.tsx";

/**
 * Summary of the selected section, or a button to make one. Short sections say so. Then the
 * earlier open items the section settled, which even a section without a summary can have.
 */
export function SectionSummary({
  session: s,
  section,
  onSelect,
}: {
  session: SessionDetail;
  section: Section;
  /** Opens another block: the one that left a settled item open. */
  onSelect: (id: string, at: number | null) => void;
}) {
  const t = drawerMessages();
  const request = useRequestSummary(s.id);
  const busy = section.pending || request.isPending;
  const summarize = () => request.mutate(section.start);

  return (
    <Block
      title={t.sectionSummary}
      emphasis
      action={
        section.body ? (
          <>
            {/* Beside the button that would rewrite it, rather than on a line of its own */}
            {section.model && (
              <span className="text-muted-foreground text-xs">
                {t.madeWith(modelLabel(section.model))}
              </span>
            )}
            <SummarizeButton
              label={t.regenerate}
              Icon={RefreshCw}
              busy={busy}
              onClick={summarize}
            />
          </>
        ) : null
      }
    >
      {section.body ? (
        <SummaryBody session={s} section={section} />
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            {busy ? t.summarizingNote : section.summarizable ? t.noSummaryYet : t.shortSection}
          </p>
          {!busy && (
            <SummarizeButton
              label={section.summarizable ? t.summarizeNow : t.summarize}
              Icon={Sparkles}
              busy={busy}
              onClick={summarize}
            />
          )}
        </div>
      )}
      {section.closes.length > 0 && (
        <Closes
          items={section.closes}
          baseUrl={issueBaseUrl(s.project?.repo)}
          onSelect={onSelect}
        />
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

/** The summary text, then whether it is stale. */
function SummaryBody({ session: s, section }: { session: SessionDetail; section: Section }) {
  const t = drawerMessages();
  const body = section.body ?? "";
  const baseUrl = issueBaseUrl(s.project?.repo);
  const parts = parseSummaryBody(body);
  return (
    <>
      {parts ? (
        <StructuredSummary
          // A new section starts with its Done points clamped again
          key={section.start}
          parts={parts}
          baseUrl={baseUrl}
          node={summaryOutcomeNode(parts, s, section)}
        />
      ) : (
        // A body in neither summary format is shown as written rather than guessed at
        <SummaryMarkdown baseUrl={baseUrl} className="text-[15px] leading-7">
          {body}
        </SummaryMarkdown>
      )}
      {section.stale && <p className="mt-2 text-muted-foreground text-xs">{t.staleSummary}</p>}
    </>
  );
}
