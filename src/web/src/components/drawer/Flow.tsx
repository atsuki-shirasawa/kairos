import type { Section, SessionDetail } from "@shared/api.ts";
import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { hhmm } from "@/lib/dates.ts";
import { flowWindow, spansDays } from "@/lib/drawer.ts";
import { cn } from "@/lib/utils.ts";
import { Block } from "./Block.tsx";

/** With more periods than this, show only those around the selected one and collapse the rest. */
const FLOW_LIMIT = 6;

/** Whether the session has anything for the flow block: several periods, a recap, or a continuation. */
export function hasFlow(s: SessionDetail): boolean {
  return Boolean(s.sections.length > 1 || s.awaySummary || s.continuedFrom || s.continuedIn);
}

/**
 * The session flow (headings of every period) and notes about the whole session.
 * Periods without a summary use the first prompt verbatim and run long, so they are kept to one muted line.
 */
export function Flow({
  session: s,
  section,
  onSelect,
}: {
  session: SessionDetail;
  section: Section | null;
  onSelect: (id: string, at: number | null) => void;
}) {
  const t = drawerMessages();
  const [expanded, setExpanded] = useState(false);
  const { shown, hiddenBefore, hiddenAfter } = flowWindow(
    s.sections,
    section,
    FLOW_LIMIT,
    expanded,
  );
  const multiDay = spansDays(s.sections);

  return (
    <Block
      title={t.flow}
      action={
        s.sections.length > FLOW_LIMIT ? (
          <Button variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t.showAround : t.showAll(s.sections.length)}
          </Button>
        ) : null
      }
    >
      {hiddenBefore > 0 && <Hidden count={hiddenBefore} where="before" />}
      {s.sections.length > 1 && (
        <ol className="space-y-0.5">
          {shown.map((x) => (
            <li key={x.start}>
              <FlowItem
                section={x}
                selected={x.start === section?.start}
                multiDay={multiDay}
                onClick={() => onSelect(s.id, x.start)}
              />
            </li>
          ))}
        </ol>
      )}
      {hiddenAfter > 0 && <Hidden count={hiddenAfter} where="after" />}

      {s.awaySummary && <AwaySummary text={s.awaySummary} />}

      {(s.continuedFrom || s.continuedIn) && (
        <ContinuationLinks
          from={s.continuedFrom}
          into={s.continuedIn}
          onSelect={(id) => onSelect(id, null)}
        />
      )}
    </Block>
  );
}

/** One period of the flow: its time range and headline, marked when selected. */
function FlowItem({
  section: x,
  selected,
  multiDay,
  onClick,
}: {
  section: Section;
  selected: boolean;
  multiDay: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected}
      title={x.headline}
      className={cn(
        "flex w-full items-baseline gap-3 rounded-r-md border-transparent border-l-2 px-2 py-1.5 text-left text-sm hover:bg-accent",
        selected && "border-primary bg-accent font-medium",
      )}
    >
      <span
        className={cn(
          "shrink-0 font-num text-muted-foreground text-xs",
          multiDay ? "w-24" : "w-[4.5rem]",
        )}
      >
        {/* In sessions spanning days, every period gets a date, including the first */}
        {multiDay && `${new Date(x.start).getMonth() + 1}/${new Date(x.start).getDate()} `}
        {hhmm(x.start)}–{hhmm(x.end)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1",
          x.body ? "line-clamp-2" : "line-clamp-1",
          !x.body && !selected && "text-muted-foreground",
        )}
      >
        {x.headline}
      </span>
    </button>
  );
}

/** Links to the session this one continued from, and the one it continued in. */
function ContinuationLinks({
  from,
  into,
  onSelect,
}: {
  from: string | null;
  into: string | null;
  onSelect: (id: string) => void;
}) {
  const t = drawerMessages();
  return (
    <div className="mt-3 flex gap-4 text-sm">
      {from && (
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => onSelect(from)}
        >
          {t.prevSession}
        </button>
      )}
      {into && (
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => onSelect(into)}
        >
          {t.nextSession}
        </button>
      )}
    </div>
  );
}

/** The recap Claude Code left behind. Often long, so it is clamped to 3 lines and expandable. */
function AwaySummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      className="mt-3 block w-full border-l-2 pl-3 text-left text-muted-foreground text-xs leading-relaxed hover:text-foreground"
    >
      <span className="mb-0.5 block font-medium">{drawerMessages().awaySummary}</span>
      <span className={cn("block", !open && "line-clamp-3")}>{text}</span>
    </button>
  );
}

/** "N earlier / later periods" in place of those the flow leaves out. */
function Hidden({ count, where }: { count: number; where: "before" | "after" }) {
  const t = drawerMessages();
  return (
    <p className="px-2 py-0.5 text-muted-foreground text-xs">
      {where === "before" ? t.hiddenBefore(count) : t.hiddenAfter(count)}
    </p>
  );
}
