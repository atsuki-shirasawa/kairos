// Projects: the filter's list and the settings the UI changes (color, hidden).
import type { Database } from "bun:sqlite";
import type { Project, ProjectUpdate } from "../../shared/api.ts";

/** A row of the projects table. */
interface ProjectRow {
  id: number;
  path: string;
  name: string;
  repo: string | null;
  color: string | null;
  hidden: number;
}

/** A project row as the API reports it. */
function toProject(r: ProjectRow): Project {
  return { ...r, hidden: r.hidden === 1 };
}

/**
 * Projects with sessions matching `visible` (a `visibleSessionSql` condition on alias `s`), by
 * name. Projects whose sessions are all hidden (e.g. only headless runs from testing a hook) don't
 * show on the calendar, so they are left out of the filter too.
 */
export function visibleProjects(db: Database, visible: string): Project[] {
  return db
    .query<ProjectRow, []>(
      `SELECT id, path, name, repo, color, hidden FROM projects p
       WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.project_id = p.id AND ${visible})
       ORDER BY name, path`,
    )
    .all()
    .map(toProject);
}

/** One project by id, or null if absent. */
export function projectById(db: Database, id: number): Project | null {
  const row = db
    .query<ProjectRow, [number]>(
      "SELECT id, path, name, repo, color, hidden FROM projects WHERE id = ?",
    )
    .get(id);
  return row ? toProject(row) : null;
}

/** Applies the given color and visibility changes. Returns the result, or null if absent. */
export function updateProject(db: Database, id: number, update: ProjectUpdate): Project | null {
  if (update.color !== undefined) {
    db.query("UPDATE projects SET color = ? WHERE id = ?").run(update.color, id);
  }
  if (update.hidden !== undefined) {
    db.query("UPDATE projects SET hidden = ? WHERE id = ?").run(update.hidden ? 1 : 0, id);
  }
  return projectById(db, id);
}
