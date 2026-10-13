// Pieces shared by the lists of open items: the drawer's "Settled from earlier" and the summary
// view's open items, so both keep the same columns.
import type { LedgerEntry } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The kind as a quiet word in a column of its own, as in the drawer's Open list, so the rows scan
 * by kind without a color for each.
 */
export function KindWord({ item }: { item: Pick<LedgerEntry, "kind"> }) {
  return (
    // Wide enough for the longest kind in either language ("Question", "やること")
    <span className="w-16 shrink-0 whitespace-nowrap font-semibold text-muted-foreground text-xs">
      {item.kind && formatMessages().openKind[item.kind]}
    </span>
  );
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
