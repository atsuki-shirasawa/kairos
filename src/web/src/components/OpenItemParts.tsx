// Pieces shared by the lists of open items: the drawer's Open list and "Settled from earlier", and
// the summary view's open items, so their rows look alike.
import type { LedgerEntry } from "@shared/api.ts";
import { closedByHand } from "@shared/openItems.ts";
import { Ban, Check, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Tag } from "@/components/ui/tag.tsx";
import type { OnOpenItemUpdate } from "@/hooks/useOpenItemEdits.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { cn } from "@/lib/utils.ts";
import { Hint } from "./Hint.tsx";

/**
 * The kind as a small outlined tag (`Tag`) before the item's text. Only
 * a tag: the list isn't grouped or columned by kind, as the model's line between waiting and
 * question is loose. English in either language (see `openKindTag`). Nothing for an item without
 * a kind.
 */
export function KindTag({ item }: { item: Pick<LedgerEntry, "kind"> }) {
  if (!item.kind) return null;
  return <Tag>{formatMessages().openKindTag[item.kind]}</Tag>;
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
        "shrink-0 whitespace-nowrap rounded-sm text-label text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring",
        numeric && "font-num tabular-nums",
      )}
    >
      {label}
    </button>
  );
}

/**
 * The hand edits a row offers: done, won't do and not an open item while the item is open; undo
 * once it was closed by hand. Nothing for an item the log or a later summary closed, since the
 * next check would close it again.
 */
export function HandActions({
  item,
  busy,
  onUpdate,
}: {
  item: LedgerEntry;
  /** An edit of this item is on its way; the buttons wait. */
  busy: boolean;
  onUpdate: OnOpenItemUpdate;
}) {
  const m = summaryMessages();
  if (item.closedAt === null)
    return (
      <span className="flex shrink-0 self-center">
        <IconAction
          label={m.markDone}
          Icon={Check}
          disabled={busy}
          onClick={() => onUpdate(item.id, "done")}
        />
        <IconAction
          label={m.dismiss}
          Icon={X}
          disabled={busy}
          onClick={() => onUpdate(item.id, "dismissed")}
        />
        <IconAction
          label={m.markMistaken}
          Icon={Ban}
          disabled={busy}
          onClick={() => onUpdate(item.id, "mistaken")}
        />
      </span>
    );
  if (!closedByHand(item.closedBy)) return null;
  return (
    <span className="flex shrink-0 self-center">
      <IconAction
        label={m.reopen}
        Icon={Undo2}
        disabled={busy}
        onClick={() => onUpdate(item.id, "open")}
      />
    </span>
  );
}

/** An icon button with its label as a tooltip and for screen readers. */
function IconAction({
  label,
  Icon,
  disabled,
  onClick,
}: {
  label: string;
  Icon: typeof Check;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Hint text={label}>
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon />
      </Button>
    </Hint>
  );
}
