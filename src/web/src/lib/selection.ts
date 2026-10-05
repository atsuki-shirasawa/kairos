// Which block is selected and which one is still being worked on, shared by the table and the
// summary so both highlight the same rows as the calendar.
import type { DayBlock } from "./layout.ts";

/**
 * Whether `block` is the selected section. With no section start (`selectedAt` null), every block
 * of the selected session counts as selected.
 */
export function isSelected(
  block: DayBlock,
  selectedId: string | null,
  selectedAt: number | null,
): boolean {
  return (
    block.session.id === selectedId && (selectedAt === null || block.segment.start === selectedAt)
  );
}

/** Whether `block` is the latest section of a session that is still running. */
export function isWorking(block: DayBlock): boolean {
  const { session, segment } = block;
  return session.active && segment.end >= Math.max(...session.segments.map((g) => g.end));
}
