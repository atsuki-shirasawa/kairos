// Rules about a block that every view answers the same way: which project it belongs to, whether
// it is selected, and whether it is still being worked on.
import { formatMessages } from "@/i18n/messages/format.ts";
import type { DayBlock } from "./layout.ts";

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

/** Whether `block` is the latest section of a session that is still running. */
export function isWorking(block: DayBlock): boolean {
  const { session, segment } = block;
  return session.active && segment.end >= Math.max(...session.segments.map((g) => g.end));
}
