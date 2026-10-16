// Pieces shared by the lists of open items: the drawer's Open list and "Settled from earlier", and
// the summary view's open items, so their rows look alike.
import type { LedgerEntry } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { cn } from "@/lib/utils.ts";
import { Badge } from "./Badge.tsx";

/**
 * The kind as a small outlined tag (`Badge`) before the item's text. Only
 * a tag: the list isn't grouped or columned by kind, as the model's line between waiting and
 * question is loose. English in either language (see `openKindTag`). Nothing for an item without
 * a kind.
 */
export function KindTag({ item }: { item: Pick<LedgerEntry, "kind"> }) {
  if (!item.kind) return null;
  return <Badge>{formatMessages().openKindTag[item.kind]}</Badge>;
}

/**
 * A row's trailing link to a block. It stays `muted-ink` until hovered: it doubles as the row's
 * date or how it closed, and a link color on every row would outshout the items themselves.
 * `numeric` sets a date or week in the numeral face.
 */
export function BlockLink({
  label,
  title,
  numeric = false,
  onClick,
}: {
  label: string;
  title?: string;
  numeric?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-sm text-muted-foreground text-xs hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring",
        numeric && "font-num tabular-nums",
      )}
    >
      {label}
    </button>
  );
}
