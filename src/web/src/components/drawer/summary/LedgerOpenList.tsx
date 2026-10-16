import type { LedgerEntry } from "@shared/api.ts";
import { BlockLink, HandActions, KindTag } from "@/components/OpenItemParts.tsx";
import { useOpenItemEdits } from "@/hooks/useOpenItemEdits.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { closedHow } from "@/lib/openItems.ts";
import { cn } from "@/lib/utils.ts";
import { SummaryMarkdown } from "./SummaryText.tsx";

/**
 * The section's Open items as the ledger tracks them: each with its kind, and the hand edits where
 * it is read (done, won't do, not an open item; undo once closed by hand). One closed since then
 * turns muted and says how, linking the block that closed it as the summary view does, so the list
 * still reads as what the section left open.
 */
export function LedgerOpenList({
  items,
  baseUrl,
  onSelect,
}: {
  items: LedgerEntry[];
  baseUrl: string | null;
  onSelect: (id: string, at: number) => void;
}) {
  const edits = useOpenItemEdits();
  return (
    <>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-3">
            <KindTag item={item} />
            <SummaryMarkdown
              baseUrl={baseUrl}
              className={cn(
                "min-w-0 flex-1 text-[15px] leading-7",
                item.closedAt !== null && "text-muted-foreground",
              )}
            >
              {item.text}
            </SummaryMarkdown>
            {item.closedAt !== null && <ClosedHow item={item} onSelect={onSelect} />}
            <HandActions item={item} busy={edits.busyId === item.id} onUpdate={edits.onUpdate} />
          </li>
        ))}
      </ul>
      {edits.failure && (
        <p className="mt-1 text-destructive text-xs" role="alert">
          {summaryMessages().openUpdateFailed(edits.failure.message)}
        </p>
      )}
    </>
  );
}

/** How an item was closed: a link to the block that closed it when one did, otherwise plain text. */
function ClosedHow({
  item,
  onSelect,
}: {
  item: LedgerEntry;
  onSelect: (id: string, at: number) => void;
}) {
  const by = item.closedSessionId;
  const at = item.closedStart;
  if (by !== null && at !== null)
    return (
      <BlockLink
        label={closedHow(item)}
        title={summaryMessages().closedShow}
        onClick={() => onSelect(by, at)}
      />
    );
  return (
    <span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs">
      {closedHow(item)}
    </span>
  );
}
