import type { LedgerEntry } from "@shared/api.ts";
import type { OpenItem, SummaryParts } from "@shared/summaryBody.ts";
import { useRef, useState } from "react";
import { MomentNode } from "@/components/MomentNode.tsx";
import { KindTag } from "@/components/OpenItemParts.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useClampedChildren } from "@/hooks/useClampedChildren.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import type { OutcomeNode } from "@/lib/artifacts.ts";
import { LedgerOpenList } from "./LedgerOpenList.tsx";
import { SummaryLabel, SummaryMarkdown } from "./SummaryText.tsx";

/**
 * The summary read as Goal → what came of it → Done, each at its own weight: why the work was done
 * and what came of it come first and largest, and the details of how follow, quieter and clamped.
 * What came of it is an older body's Outcome, or Resolved, Open and Next. No surface behind any of
 * it; the type sizes alone make this the place to read. Open comes from the ledger when it tracks
 * the section's items, so they can be closed where they are read.
 */
export function StructuredSummary({
  parts,
  opens,
  baseUrl,
  node,
  onSelect,
}: {
  parts: SummaryParts;
  /** The ledger's entries for the section's Open items; empty for a summary from before it. */
  opens: LedgerEntry[];
  baseUrl: string | null;
  node: OutcomeNode;
  /** Opens a block: where an item the section left open was closed. */
  onSelect: (id: string, at: number) => void;
}) {
  const t = drawerMessages();
  return (
    <div className="space-y-5">
      {/* The lead sentence needs no label: it is the first thing read under the headline */}
      <SummaryMarkdown baseUrl={baseUrl} className="text-foreground text-title leading-7">
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
      {opens.length > 0 ? (
        <SummaryItem label={t.summaryOpen}>
          <LedgerOpenList items={opens} baseUrl={baseUrl} onSelect={onSelect} />
        </SummaryItem>
      ) : (
        parts.open.length > 0 && (
          <SummaryItem label={t.summaryOpen}>
            <OpenList items={parts.open} baseUrl={baseUrl} />
          </SummaryItem>
        )
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
    <SummaryMarkdown baseUrl={baseUrl} className="min-w-0 text-read leading-7">
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
    <ul className="min-w-0 list-disc pl-5 marker:text-label">
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
 * Open items of a summary written before the ledger, as the body states them: each led by its kind
 * as a small tag. No bullets: the tag already starts each row, and an item without a kind starts
 * with its text.
 */
function OpenList({ items, baseUrl }: { items: OpenItem[]; baseUrl: string | null }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        // Points have no identity beyond their place in the list
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <li key={i} className="flex items-baseline gap-3">
          <KindTag item={item} />
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
      <ul
        ref={listRef}
        className="list-disc space-y-1 pl-5 text-muted-foreground marker:text-label"
      >
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
