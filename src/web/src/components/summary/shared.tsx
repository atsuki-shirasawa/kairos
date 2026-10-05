// Small pieces shared by the summary's sections.
import type { Project, Usage } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { costLabel } from "@/lib/format.ts";

/** A section heading of the summary. */
export function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 font-medium text-muted-foreground text-xs">{children}</h2>;
}

/** The project with `id`, if known. */
export const projectOf = (projects: Map<number, Project>, id: number | null) =>
  id !== null ? projects.get(id) : undefined;

/** The project's name, or the "unknown project" label. */
export const projectName = (projects: Map<number, Project>, id: number | null) =>
  projectOf(projects, id)?.name ?? formatMessages().unknownProject;

/** Estimated cost, marked "~" when some models had no known price. */
export const costText = (u: Usage | null) =>
  u ? `${u.unpriced ? "~" : ""}${costLabel(u.costUsd)}` : formatMessages().none;
