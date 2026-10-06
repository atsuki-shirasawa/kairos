import { X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { filterMessages } from "@/i18n/messages/filter.ts";
import { type Filter, NO_FILTER, OUTCOMES, STATES, withoutConditions } from "@/lib/filter.ts";

/** One active condition: what it says and the filter without it. */
interface Chip {
  key: string;
  label: string;
  without: Filter;
}

/**
 * The menu's conditions currently applied, one chip each, in the menu's order. Outcomes share one
 * chip because they combine as "any of"; states get one each because each narrows further.
 * The keyword isn't here: the search field already shows it.
 */
function chipsOf(filter: Filter): Chip[] {
  const m = filterMessages();
  const chips: Chip[] = [];
  if (filter.outcomes.length > 0)
    chips.push({
      key: "outcome",
      label: m.outcomeChip(
        OUTCOMES.filter((o) => filter.outcomes.includes(o)).map((o) => m.outcome[o]),
      ),
      without: { ...filter, outcomes: [] },
    });
  for (const st of STATES)
    if (filter.states.includes(st))
      chips.push({
        key: `state-${st}`,
        label: m.state[st],
        without: { ...filter, states: filter.states.filter((v) => v !== st) },
      });
  if (filter.minMinutes > 0)
    chips.push({
      key: "length",
      label: m.lengthChip(filter.minMinutes),
      without: { ...filter, minMinutes: NO_FILTER.minMinutes },
    });
  if (filter.branch !== null)
    chips.push({
      key: "branch",
      label: m.branchChip(filter.branch),
      without: { ...filter, branch: null },
    });
  if (filter.hideBrief)
    chips.push({ key: "brief", label: m.briefChip, without: { ...filter, hideBrief: false } });
  return chips;
}

/**
 * A row under the toolbar listing the applied conditions, so what narrows the view stays in
 * sight with the menu closed, and each can be dropped with one click. Absent when nothing applies.
 */
export function FilterChips({
  filter,
  onFilter,
}: {
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const m = filterMessages();
  const chips = chipsOf(filter);
  if (chips.length === 0) return null;
  return (
    <section
      aria-label={m.chipsLabel}
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-background px-5 py-1.5 max-md:px-3"
    >
      {chips.map((c) => (
        <span
          key={c.key}
          className="flex h-6 max-w-72 items-center gap-0.5 rounded-full border bg-card pr-0.5 pl-2.5 text-xs"
        >
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label={m.remove(c.label)}
            title={m.remove(c.label)}
            onClick={() => onFilter(c.without)}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onFilter({ ...withoutConditions(filter), hideBrief: false })}
        >
          {m.clearAll}
        </Button>
      )}
    </section>
  );
}
