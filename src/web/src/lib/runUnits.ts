// The runs of one unit of work (`CalendarSession.unit`): several automation runs that are one
// piece of work, which the calendar draws, heads and steps through as one.
import type { CalendarSession } from "@shared/api.ts";

/** Something drawn for a session: a block, a mark, a row. */
type OfSession = { session: CalendarSession };

/** Each unit of work's items among `items`, in their order, by the unit's id. */
export function unitGroups<T extends OfSession>(items: readonly T[]): Map<string, T[]> {
  const units = new Map<string, T[]>();
  for (const item of items) {
    const { unit } = item.session;
    if (!unit) continue;
    const group = units.get(unit.id);
    if (group) group.push(item);
    else units.set(unit.id, [item]);
  }
  return units;
}

/** The number of the unit of work all of `items` belong to, or null when they aren't one unit. */
export function unitRef(items: readonly OfSession[]): number | null {
  const unit = items[0]?.session.unit;
  return unit && items.every((i) => i.session.unit?.id === unit.id) ? unit.ref : null;
}

/** How many runs `items` stand for: the blocks of one session are one run. */
export function runCount(items: readonly OfSession[]): number {
  return new Set(items.map((i) => i.session.id)).size;
}
