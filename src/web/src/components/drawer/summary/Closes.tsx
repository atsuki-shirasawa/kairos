import type { LedgerEntry } from "@shared/api.ts";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { dateLabel } from "@/lib/dates.ts";
import { BlockLink, KindWord } from "../../OpenItemParts.tsx";
import { SummaryLabel, SummaryMarkdown } from "./SummaryText.tsx";

/**
 * Earlier open items this section settled, each with its kind and a link to the block that left
 * it open, so following an item back to where it started is one click.
 */
export function Closes({
  items,
  baseUrl,
  onSelect,
}: {
  items: LedgerEntry[];
  baseUrl: string | null;
  onSelect: (id: string, at: number | null) => void;
}) {
  const t = drawerMessages();
  return (
    <div className="mt-5">
      <SummaryLabel>{t.summaryCloses}</SummaryLabel>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-3">
            <KindWord item={item} />
            <SummaryMarkdown baseUrl={baseUrl} className="min-w-0 flex-1 text-[15px] leading-7">
              {item.text}
            </SummaryMarkdown>
            <BlockLink
              label={t.closesFrom(dateLabel(item.openedAt))}
              numeric
              onClick={() => onSelect(item.sessionId, item.start)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
