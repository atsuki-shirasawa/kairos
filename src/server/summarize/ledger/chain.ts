// Where a session's open items can be seen and settled: its project, and the chain of sessions
// that continue one another (`continued_in` points forward).
import type { Database } from "bun:sqlite";

/** The session and the sessions it continues, recursively. */
export function predecessors(db: Database, sessionId: string): string[] {
  return db
    .query<{ id: string }, [string]>(
      `WITH RECURSIVE chain(id) AS (
         SELECT ? UNION SELECT s.id FROM sessions s JOIN chain c ON s.continued_in = c.id
       ) SELECT id FROM chain`,
    )
    .all(sessionId)
    .map((r) => r.id);
}

/** The session and the sessions continuing it, recursively. */
export function successors(db: Database, sessionId: string): string[] {
  return db
    .query<{ id: string }, [string]>(
      `WITH RECURSIVE chain(id) AS (
         SELECT ? UNION SELECT s.continued_in FROM sessions s JOIN chain c ON s.id = c.id
         WHERE s.continued_in IS NOT NULL
       ) SELECT id FROM chain`,
    )
    .all(sessionId)
    .map((r) => r.id);
}

/** The session's project, or null when it has none (or doesn't exist). */
export function projectOf(db: Database, sessionId: string): number | null {
  return (
    db
      .query<{ project_id: number | null }, [string]>(
        "SELECT project_id FROM sessions WHERE id = ?",
      )
      .get(sessionId)?.project_id ?? null
  );
}
