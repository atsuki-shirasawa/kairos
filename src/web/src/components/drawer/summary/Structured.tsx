import type { OpenItem, SummaryParts } from "@shared/summaryBody.ts";
import { useRef, useState } from "react";
import { MomentNode } from "@/components/MomentNode.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useClampedChildren } from "@/hooks/useClampedChildren.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import type { OutcomeNode } from "@/lib/artifacts.ts";
import { KindWord } from "../../OpenItemParts.tsx";
import { SummaryLabel, SummaryMarkdown } from "./SummaryText.tsx";

/**
 * The summary read as Goal → what came of it → Done, each at its own weight: why the work was done
 * and what came of it come first and largest, and the details of how follow, quieter and clamped.
 * What came of it is an older body's Outcome, or Resolved, Open and Next. No surface behind any of
 * it; the type sizes alone make this the place to read.
 */
export function StructuredSummary({
  parts,
  baseUrl,
  node,
}: {
  parts: SummaryParts;
  baseUrl: string | null;
  node: OutcomeNode;
}) {
  const t = drawerMessages();
  return (
    <div className="space-y-5">
      {/* The lead sentence needs no label: it is the first thing read under the headline */}
      <SummaryMarkdown baseUrl={baseUrl} className="text-[17px] text-foreground leading-7">
        {parts.goal}
      </SummaryMarkdown>
      {parts.outcome !== null && (
        <SummaryItem label={t.summaryOutcome}>
          <WithNode node={node}>
            <PointText baseUrl={baseUrl}>{parts.outcome}</PointText>
          </WithNode>
        </SummaryItem>
      )}
      {parts.resolved.length > 0 && (
        <SummaryItem label={t.summaryResolved}>
          <WithNode node={node}>
            <PointList items={parts.resolved} baseUrl={baseUrl} />
          </WithNode>
        </SummaryItem>
      )}
      {parts.open.length > 0 && (
        <SummaryItem label={t.summaryOpen}>
          <OpenList items={parts.open} baseUrl={baseUrl} />
        </SummaryItem>
      )}
      {parts.next !== null && (
        <SummaryItem label={t.summaryNext}>
          <PointText baseUrl={baseUrl}>{parts.next}</PointText>
        </SummaryItem>
      )}
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

/** The text of one point (Outcome, Next, an Open or Resolved item) at the summary's reading size. */
function PointText({ baseUrl, children }: { baseUrl: string | null; children: string }) {
  return (
    <SummaryMarkdown baseUrl={baseUrl} className="min-w-0 text-[15px] leading-7">
      {children}
    </SummaryMarkdown>
  );
}

/** What came of the work, with the PR or commit node beside it when it names one. */
function WithNode({ node, children }: { node: OutcomeNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      {/* Centered on the first line (28px leading) */}
      {node && <MomentNode pr={node === "pr"} className="mt-2.5" />}
      {children}
    </div>
  );
}

/** Resolved's points as a plain list; a single point needs no bullet. */
function PointList({ items, baseUrl }: { items: string[]; baseUrl: string | null }) {
  if (items.length === 1 && items[0] !== undefined) {
    return <PointText baseUrl={baseUrl}>{items[0]}</PointText>;
  }
  return (
    <ul className="min-w-0 list-disc pl-5 marker:text-xs">
      {items.map((item, i) => (
        // Points have no identity beyond their place in the list
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <li key={i}>
          <PointText baseUrl={baseUrl}>{item}</PointText>
        </li>
      ))}
    </ul>
  );
}

/**
 * Open items, each with its kind as a quiet word in a column of its own, so the list can be
 * scanned by kind without a color for each. No bullets: the column already starts each row. The
 * column is left out when no item has a kind.
 */
function OpenList({ items, baseUrl }: { items: OpenItem[]; baseUrl: string | null }) {
  const kinds = items.some((o) => o.kind);
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        // Points have no identity beyond their place in the list
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <li key={i} className="flex items-baseline gap-3">
          {kinds && <KindWord item={item} />}
          <PointText baseUrl={baseUrl}>{item.text}</PointText>
        </li>
      ))}
    </ul>
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
            <SummaryMarkdown baseUrl={baseUrl} className="leading-normal" clamped={!expanded}>
              {item}
            </SummaryMarkdown>
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
