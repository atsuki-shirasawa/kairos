import type { Section, SessionDetail } from "@shared/api.ts";
import { type OpenItem, parseSummaryBody, type SummaryParts } from "@shared/summaryBody.ts";
import { RefreshCw, Sparkles } from "lucide-react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { MomentNode } from "@/components/MomentNode.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useRequestSummary } from "@/hooks/queries.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { outcomeNode, splitOutcomes, summaryFailureKind } from "@/lib/drawer.ts";
import { modelLabel } from "@/lib/format.ts";
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
      action={
        section.body ? (
          <>
            {/* Beside the button that would rewrite it, rather than on a line of its own */}
            {section.model && (
              <span className="text-muted-foreground text-xs">
                {t.madeWith(modelLabel(section.model))}
              </span>
            )}
            {button(t.regenerate, RefreshCw)}
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

/**
 * How Markdown inside the summary is set, structured or not: bold at the app's semibold and room
 * between list items, so a summary looks the same whether or not it parses.
 */
const SUMMARY_MARKDOWN = "[&_li+li]:mt-1 [&_li>ol]:mt-1 [&_li>ul]:mt-1 [&_strong]:font-semibold";

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
          node={outcomeNode(
            parts.outcome ?? parts.resolved.join("\n"),
            splitOutcomes(s.prs, s.commits, section).here,
          )}
        />
      ) : (
        // A body in neither summary format is shown as written rather than guessed at
        <Markdown issueBaseUrl={baseUrl} className={cn("text-[15px] leading-7", SUMMARY_MARKDOWN)}>
          {body}
        </Markdown>
      )}
      {section.stale && <p className="mt-2 text-muted-foreground text-xs">{t.staleSummary}</p>}
    </>
  );
}

/**
 * The summary read as Goal → what came of it → Done, each at its own weight: why the work was done
 * and what came of it come first and largest, and the details of how follow, quieter and clamped.
 * What came of it is an older body's Outcome, or Resolved, Open and Next. No surface behind any of
 * it; the type sizes alone make this the place to read.
 */
function StructuredSummary({
  parts,
  baseUrl,
  node,
}: {
  parts: SummaryParts;
  baseUrl: string | null;
  node: "pr" | "commit" | null;
}) {
  const t = drawerMessages();
  const text = (children: string) => (
    <Markdown
      issueBaseUrl={baseUrl}
      className={cn("min-w-0 text-[15px] leading-7", SUMMARY_MARKDOWN)}
    >
      {children}
    </Markdown>
  );
  // Centered on the first line (28px leading)
  const withNode = (children: React.ReactNode) => (
    <div className="flex gap-2">
      {node && <MomentNode pr={node === "pr"} className="mt-2.5" />}
      {children}
    </div>
  );
  return (
    <div className="space-y-5">
      {/* The lead sentence needs no label: it is the first thing read under the headline */}
      <Markdown
        issueBaseUrl={baseUrl}
        className={cn("text-[17px] text-foreground leading-7", SUMMARY_MARKDOWN)}
      >
        {parts.goal}
      </Markdown>
      {parts.outcome !== null && (
        <SummaryItem label={t.summaryOutcome}>{withNode(text(parts.outcome))}</SummaryItem>
      )}
      {parts.resolved.length > 0 && (
        <SummaryItem label={t.summaryResolved}>
          {withNode(<PointList items={parts.resolved} render={text} />)}
        </SummaryItem>
      )}
      {parts.open.length > 0 && (
        <SummaryItem label={t.summaryOpen}>
          <PointList items={parts.open} render={(o) => <OpenPoint item={o} text={text} />} />
        </SummaryItem>
      )}
      {parts.next !== null && <SummaryItem label={t.summaryNext}>{text(parts.next)}</SummaryItem>}
      <SummaryItem label={t.summaryDone}>
        <DoneList items={parts.done} baseUrl={baseUrl} />
      </SummaryItem>
    </div>
  );
}

/** One of the summary's items under its label. */
function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SummaryLabel>{label}</SummaryLabel>
      {children}
    </div>
  );
}

/** Resolved or Open points as a plain list; a single point needs no bullet. */
function PointList<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  if (items.length === 1 && items[0] !== undefined) return render(items[0]);
  return (
    <ul className="min-w-0 list-disc pl-5 marker:text-xs">
      {items.map((item, i) => (
        // Points have no identity beyond their place in the list
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <li key={i}>{render(item)}</li>
      ))}
    </ul>
  );
}

/** An open item, its kind as a quiet word before it so the list can be scanned by kind. */
function OpenPoint({
  item,
  text,
}: {
  item: OpenItem;
  text: (children: string) => React.ReactNode;
}) {
  const t = drawerMessages();
  return (
    <div className="flex items-baseline gap-2">
      {item.kind && (
        <span className="shrink-0 font-semibold text-muted-foreground text-xs">
          {t.openKind[item.kind]}
        </span>
      )}
      {text(item.text)}
    </div>
  );
}

/** A label over one of the summary's items, in the drawer's small heading style. */
function SummaryLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1 font-semibold text-muted-foreground text-xs tracking-wide">{children}</h4>
  );
}

/**
 * Done's points, each clamped to two lines so a long one doesn't push the rest of the drawer
 * away. The toggle appears only when a point is actually cut off at the drawer's current width.
 */
function DoneList({ items, baseUrl }: { items: string[]; baseUrl: string | null }) {
  const t = drawerMessages();
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const cut = useClampedChildren(listRef, items, expanded);
  return (
    <>
      <ul ref={listRef} className="list-disc space-y-1 pl-5 text-muted-foreground marker:text-xs">
        {items.map((item, i) => (
          // Points have no identity beyond their place in the list
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <li key={i}>
            <Markdown
              issueBaseUrl={baseUrl}
              className={cn("leading-normal", SUMMARY_MARKDOWN, !expanded && "line-clamp-2")}
            >
              {item}
            </Markdown>
          </li>
        ))}
      </ul>
      {(cut || expanded) && (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1 -ml-2 text-muted-foreground"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? t.clampDone : t.showAllDone}
        </Button>
      )}
    </>
  );
}

/**
 * Whether any list item's content is cut off by its line clamp. Re-checked when the items change,
 * when the list resizes (the drawer can be resized) and once the web fonts are in: a clamped item
 * keeps its two-line height whatever it holds, so neither of the last two resizes the list. Not
 * measured while expanded: nothing is cut.
 */
function useClampedChildren(
  ref: RefObject<HTMLElement | null>,
  items: string[],
  expanded: boolean,
): boolean {
  const [cut, setCut] = useState(false);
  // `items` isn't read in the effect, but new text can be cut where the old wasn't
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () =>
      setCut(
        [...el.querySelectorAll<HTMLElement>("li > div")].some(
          (d) => d.scrollHeight > d.clientHeight + 1,
        ),
      );
    measure();
    let live = true;
    void document.fonts.ready.then(() => live && measure());
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [ref, items, expanded]);
  return cut;
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
