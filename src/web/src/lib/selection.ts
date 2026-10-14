// Rules about a block that every view answers the same way: which project it belongs to, whether
// it is selected, whether it is still being worked on, and whether it is toned down.
import { formatMessages } from "@/i18n/messages/format.ts";
import type { DayBlock } from "./dayBlocks.ts";

/** The project with `id`, if known. Sessions outside any project have no id. */
export function projectOf<P>(projects: ReadonlyMap<number, P>, id: number | null): P | undefined {
  return id !== null ? projects.get(id) : undefined;
}

/** A project's name, or the "unknown project" label for work outside any project. */
export function projectLabel(project: { name: string } | null | undefined): string {
  return project?.name ?? formatMessages().unknownProject;
}

/** The name of the project with `id`, or the "unknown project" label. */
export function projectName(
  projects: ReadonlyMap<number, { name: string }>,
  id: number | null,
): string {
  return projectLabel(projectOf(projects, id));
}

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

/**
 * When a session's work ends so far: the latest end among its sections. Whether a section is the
 * one still being worked on is judged against it.
 */
export function sessionEnd(session: Pick<DayBlock["session"], "segments">): number {
  return Math.max(...session.segments.map((g) => g.end));
}

/** Whether `block` is the latest section of a session that is still running. */
export function isWorking(block: Pick<DayBlock, "session" | "segment">): boolean {
  const { session, segment } = block;
  return session.active && segment.end >= sessionEnd(session);
}

/**
 * Whether `block` is toned down. Before it is summarized its heading is only the raw first prompt
 * ("sorry, meant for another session", etc.), which is noise next to summarized work. Work still
 * in progress is only waiting for its summary, so it keeps the normal look. Every view (week, day,
 * month, marks, list) uses this rule.
 */
export function isDim(block: Pick<DayBlock, "session" | "segment">): boolean {
  return !block.segment.summarized && !isWorking(block);
}
