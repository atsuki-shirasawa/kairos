import type { LedgerEntry } from "@shared/api.ts";
import { Check, ChevronRight, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { dateLabel } from "@/lib/dates.ts";
import { logCloses, OLD_WEEKS, type ProjectOpenItems, weekOpen } from "@/lib/openItems.ts";
import { cn } from "@/lib/utils.ts";
import type { View } from "@/lib/view.ts";
import { Hint } from "../Hint.tsx";
import { Markdown } from "../Markdown.tsx";
import { BlockLink, KindTag } from "../OpenItemParts.tsx";

/** What a row can do: open a block, or close / reopen its item by hand. */
interface Actions {
  onSelect: (id: string, at: number) => void;
  onUpdate: (id: number, state: "done" | "dismissed" | "open") => void;
  /** The item being updated, whose buttons wait. */
  busyId: number | null;
  /** Where `#123` in item text links to, from the project's repository. */
  baseUrl: string | null;
}

/**
 * A project's open items under its recap: what is open at the end of the period (newest first),
 * those open `OLD_WEEKS` weeks or more folded away and faded, and what was closed during it.
 */
export function OpenItems({
  view,
  items,
  at,
  error,
  ...actions
}: Actions & {
  view: View;
  items: ProjectOpenItems;
  /** When ages are measured: the period's end, or now while it runs. */
  at: number;
  /** Why the latest hand edit failed. */
  error: string | null;
}) {
  const m = summaryMessages();
  const count = items.open.length + items.old.length;
  if (count === 0 && items.closed.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h4 className="font-semibold text-muted-foreground text-xs tracking-wide">
          {m.openHeading(count)}
        </h4>
        <Hint text={m.openDeltaNote(view)}>
          <span className="font-num text-muted-foreground text-xs tabular-nums">
            {m.openDelta(view, items.opened, items.closedIn)}
          </span>
        </Hint>
      </div>
      {items.open.length > 0 && (
        <ul>
          {items.open.map((item) => (
            <OpenRow key={item.id} item={item} at={at} {...actions} />
          ))}
        </ul>
      )}
      {items.old.length > 0 && (
        <Folded label={m.openOld(OLD_WEEKS, items.old.length)}>
          <ul>
            {items.old.map((item) => (
              <OpenRow key={item.id} item={item} at={at} faded {...actions} />
            ))}
          </ul>
        </Folded>
      )}
      {items.closed.length > 0 && (
        <Folded label={m.openClosed(view, items.closed.length)}>
          <ul>
            {items.closed.map((item) => (
              <ClosedRow key={item.id} item={item} {...actions} />
            ))}
          </ul>
        </Folded>
      )}
      {error && (
        <p className="mt-1 text-destructive text-xs" role="alert">
          {m.openUpdateFailed(error)}
        </p>
      )}
    </div>
  );
}

/** A group shown only when asked for, behind a toggle that says what it holds. */
function Folded({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <Button
        variant="ghost"
        size="xs"
        className="-ml-2 text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
        {label}
      </Button>
      {open && children}
    </div>
  );
}

/** The item's own text. It may link issues, so the row's link to its block is the age instead. */
function ItemText({
  item,
  baseUrl,
  muted,
  faded,
}: {
  item: LedgerEntry;
  baseUrl: string | null;
  muted?: boolean;
  /** An old item: only its text fades, so its age and buttons stay readable. */
  faded?: boolean;
}) {
  return (
    <Markdown
      issueBaseUrl={baseUrl}
      className={cn(
        "min-w-0 flex-1 text-sm leading-normal",
        muted && "text-muted-foreground",
        faded && "opacity-60",
      )}
    >
      {item.text}
    </Markdown>
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

/** An open item: kind, text, how long it has been open (opens its block), and done / won't do. */
function OpenRow({
  item,
  at,
  onSelect,
  onUpdate,
  busyId,
  baseUrl,
  faded = false,
}: Actions & { item: LedgerEntry; at: number; faded?: boolean }) {
  const m = summaryMessages();
  const week = weekOpen(item, at);
  return (
    <li className="flex items-baseline gap-3 py-0.5">
      <KindTag item={item} />
      <ItemText item={item} baseUrl={baseUrl} faded={faded} />
      <BlockLink
        label={week > 1 ? m.openWeek(week) : m.openSince(dateLabel(item.openedAt, at))}
        title={m.openShow}
        numeric
        onClick={() => onSelect(item.sessionId, item.start)}
      />
      <span className="flex shrink-0 self-center">
        <IconAction
          label={m.markDone}
          Icon={Check}
          disabled={busyId === item.id}
          onClick={() => onUpdate(item.id, "done")}
        />
        <IconAction
          label={m.dismiss}
          Icon={X}
          disabled={busyId === item.id}
          onClick={() => onUpdate(item.id, "dismissed")}
        />
      </span>
    </li>
  );
}

/** How an item was closed, in words. */
function closedHow(item: LedgerEntry): string {
  const m = summaryMessages();
  switch (item.closedBy) {
    case "ref":
      return m.closedByRef(logCloses(item.closedNote));
    case "user":
      return m.closedByUser;
    case "dismissed":
      return m.closedDismissed;
    default:
      return m.closedByModel;
  }
}

/**
 * An item closed during the period: how it was closed (opens the block that closed it, when one
 * did), and undo for one closed by hand.
 */
function ClosedRow({ item, onSelect, onUpdate, busyId, baseUrl }: Actions & { item: LedgerEntry }) {
  const m = summaryMessages();
  const how = closedHow(item);
  const by = item.closedSessionId;
  const at = item.closedStart;
  const byHand = item.closedBy === "user" || item.closedBy === "dismissed";
  return (
    <li className="flex items-baseline gap-3 py-0.5">
      <KindTag item={item} />
      <ItemText item={item} baseUrl={baseUrl} muted />
      {by !== null && at !== null ? (
        <BlockLink label={how} title={m.closedShow} onClick={() => onSelect(by, at)} />
      ) : (
        <span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs">{how}</span>
      )}
      {byHand && (
        <span className="flex shrink-0 self-center">
          <IconAction
            label={m.reopen}
            Icon={Undo2}
            disabled={busyId === item.id}
            onClick={() => onUpdate(item.id, "open")}
          />
        </span>
      )}
    </li>
  );
}
