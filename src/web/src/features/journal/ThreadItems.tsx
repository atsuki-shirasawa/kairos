import type { LedgerEntry } from "@shared/api.ts";
import { Markdown } from "@/components/Markdown.tsx";
import { BlockLink, ClosedLink, KindTag } from "@/components/OpenItemParts.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { threadMessages } from "@/i18n/messages/thread.ts";
import { dateLabel } from "@/lib/dates.ts";
import { threadItems } from "@/lib/thread.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The items the thread's blocks left open: those still open, then those settled since, each
 * linking to the block that left it open or the one that closed it. Nothing when it left none.
 */
export function ThreadItems({
  items,
  now,
  onSelect,
}: {
  items: LedgerEntry[];
  now: number;
  onSelect: (id: string, at: number) => void;
}) {
  const m = threadMessages();
  const { open, closed } = threadItems(items);
  if (items.length === 0) return null;
  return (
    <section className="space-y-3 border-t pt-4">
      {open.length > 0 && (
        <ItemList heading={m.stillOpen(open.length)}>
          {open.map((item) => (
            <ItemRow key={item.id} item={item}>
              <BlockLink
                label={m.openedOn(dateLabel(item.openedAt, now))}
                title={summaryMessages().openShow}
                numeric
                onClick={() => onSelect(item.sessionId, item.start)}
              />
            </ItemRow>
          ))}
        </ItemList>
      )}
      {closed.length > 0 && (
        <ItemList heading={m.settled(closed.length)}>
          {closed.map((item) => (
            <ItemRow key={item.id} item={item} muted>
              <ClosedLink item={item} onSelect={onSelect} />
            </ItemRow>
          ))}
        </ItemList>
      )}
    </section>
  );
}

/** A heading and its list. */
function ItemList({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1 font-semibold text-label text-muted-foreground tracking-wide">
        {heading}
      </h2>
      <ul>{children}</ul>
    </div>
  );
}

/** An item: its kind, its text, and what follows it (a link to a block). */
function ItemRow({
  item,
  muted = false,
  children,
}: {
  item: LedgerEntry;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-baseline gap-3 py-0.5">
      <KindTag item={item} />
      <Markdown
        className={cn("min-w-0 flex-1 text-body leading-normal", muted && "text-muted-foreground")}
      >
        {item.text}
      </Markdown>
      {children}
    </li>
  );
}
