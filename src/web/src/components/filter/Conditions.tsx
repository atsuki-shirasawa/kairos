import type { CalendarSession } from "@shared/api.ts";
import { useMemo } from "react";
import { SEGMENT, SEGMENTED } from "@/components/toolbar/segmented.ts";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { filterMessages } from "@/i18n/messages/filter.ts";
import {
  type BlockState,
  BRIEF_PROMPTS,
  branchOptions,
  conditionCount,
  countBlocks,
  type Filter,
  hasOutcome,
  inState,
  MIN_LENGTHS,
  OUTCOMES,
  type Outcome,
  STATES,
  withoutConditions,
} from "@/lib/filter.ts";

/** Select value for "any branch". `*` can't appear in a git branch name, so it never collides. */
const ANY_BRANCH = "*";

/** Adds or removes one value of a multi-choice condition. */
function toggled<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list, value] : list.filter((v) => v !== value);
}

/**
 * The narrowing conditions at the top of the filter menu, grouped by what they ask: what a block
 * made (any of them), what state it was in (all of them), how long it was, and which branch.
 * Each option shows how many of the period's blocks it alone would keep.
 */
export function Conditions({
  sessions,
  filter,
  onFilter,
}: {
  /** The period's sessions outside hidden projects, for the counts and the branch list. */
  sessions: CalendarSession[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const m = filterMessages();
  const counts = useMemo(
    () => ({
      outcome: Object.fromEntries(
        OUTCOMES.map((o) => [o, countBlocks(sessions, (_, g) => hasOutcome(g, [o]))]),
      ) as Record<Outcome, number>,
      state: Object.fromEntries(
        STATES.map((st) => [st, countBlocks(sessions, (s, g) => inState(s, g, st))]),
      ) as Record<BlockState, number>,
    }),
    [sessions],
  );
  const branches = useMemo(() => branchOptions(sessions, filter.branch), [sessions, filter.branch]);
  const set = (patch: Partial<Filter>) => onFilter({ ...filter, ...patch });

  return (
    <div className="flex flex-col gap-3 border-b p-3">
      <div className="flex h-6 items-center justify-between">
        <span className="font-medium text-muted-foreground text-xs">{m.conditions}</span>
        {(conditionCount(filter) > 0 || filter.hideBrief) && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onFilter({ ...withoutConditions(filter), hideBrief: false })}
          >
            {m.clear}
          </Button>
        )}
      </div>

      <Group label={m.outcomes} note={m.outcomesNote}>
        {OUTCOMES.map((o) => (
          <Option
            key={o}
            id={`filter-outcome-${o}`}
            label={m.outcome[o]}
            count={counts.outcome[o]}
            checked={filter.outcomes.includes(o)}
            onChange={(on) => set({ outcomes: toggled(filter.outcomes, o, on) })}
          />
        ))}
      </Group>

      <Group label={m.states} note={m.statesNote}>
        {STATES.map((st) => (
          <Option
            key={st}
            id={`filter-state-${st}`}
            label={m.state[st]}
            count={counts.state[st]}
            checked={filter.states.includes(st)}
            onChange={(on) => set({ states: toggled(filter.states, st, on) })}
          />
        ))}
      </Group>

      <Group label={m.length}>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0.5}
          value={String(filter.minMinutes)}
          onValueChange={(v) => v && set({ minMinutes: Number(v) })}
          aria-label={m.length}
          className={`w-fit ${SEGMENTED}`}
        >
          <ToggleGroupItem value="0" className={SEGMENT}>
            {m.anyLength}
          </ToggleGroupItem>
          {MIN_LENGTHS.map((min) => (
            <ToggleGroupItem key={min} value={String(min)} className={`${SEGMENT} font-num`}>
              {m.minLength(min)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>

      <Group label={m.branch}>
        <Select
          value={filter.branch ?? ANY_BRANCH}
          onValueChange={(v) => set({ branch: v === ANY_BRANCH ? null : v })}
          disabled={branches.length === 0}
        >
          <SelectTrigger size="sm" aria-label={m.branch} className="w-full rounded-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="max-h-72">
            <SelectItem value={ANY_BRANCH}>{m.anyBranch}</SelectItem>
            {branches.map((b) => (
              <SelectItem
                key={b.name}
                value={b.name}
                hint={
                  <span
                    className="ml-auto pl-3 font-num text-[11px] text-muted-foreground"
                    title={m.blockCount(b.blocks)}
                  >
                    {b.blocks || ""}
                  </span>
                }
              >
                <span className="max-w-60 truncate">{b.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Group>

      <div className="flex items-start gap-2.5 text-sm">
        <Checkbox
          id="filter-brief"
          className="mt-0.5"
          checked={filter.hideBrief}
          onCheckedChange={(v) => set({ hideBrief: v === true })}
          aria-describedby="filter-brief-note"
        />
        <div className="flex flex-col">
          <label htmlFor="filter-brief">{m.hideBrief}</label>
          <span id="filter-brief-note" className="text-muted-foreground text-xs">
            {m.hideBriefNote(BRIEF_PROMPTS)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** A labeled group of options; the note says how its options combine. */
function Group({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 flex w-full items-baseline gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        {note && <span className="text-muted-foreground">{note}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

/** One checkbox option with the number of the period's blocks it would keep on its own. */
function Option({
  id,
  label,
  count,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  count: number;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const m = filterMessages();
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <label htmlFor={id} className="min-w-0 flex-1 truncate">
        {label}
      </label>
      <span className="font-num text-muted-foreground text-xs" title={m.blockCount(count)}>
        {count || ""}
      </span>
    </div>
  );
}
