// Project lookups the read commands share: projects by id, and leaving out hidden projects' work.
import type { Project } from "../shared/api.ts";
import { isProjectShown } from "../shared/projects.ts";

/** Projects keyed by id, as the views look them up. */
export function projectsById(list: readonly Project[]): Map<number, Project> {
  return new Map(list.map((p) => [p.id, p]));
}

/**
 * The items whose project is shown. Each read command applies it once to what it read, so the
 * views and the JSON output get the same list. The report (`shared/report.ts`) leaves hidden work
 * out itself, so it can't list it whoever calls it.
 */
export function visibleOnly<T extends { projectId: number | null }>(
  items: readonly T[],
  projects: ReadonlyMap<number, Project>,
): T[] {
  return items.filter((item) => isProjectShown(projects, item.projectId));
}
