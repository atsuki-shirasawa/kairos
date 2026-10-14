// Rules about projects that the CLI and the web app must agree on.

/**
 * Whether work in a project is shown: hidden projects are left out of lists, while work outside
 * any project (`null`) and in a project not loaded yet stays visible.
 */
export function isProjectShown(
  projects: ReadonlyMap<number, { hidden: boolean }>,
  projectId: number | null,
): boolean {
  return projectId === null || projects.get(projectId)?.hidden !== true;
}
