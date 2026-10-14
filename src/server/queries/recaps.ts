// Project recaps of a period as the summary view lists them, written or not.
import type { Database } from "bun:sqlite";
import type { Recap } from "../../shared/api.ts";
import { loadRecapInput, recapHash } from "../summarize/recap.ts";
import type { SummaryState } from "./summaryState.ts";

/** A stored recap row. */
interface StoredRecap {
  body: string;
  model: string;
  input_hash: string;
  created_at: number;
}

/**
 * Recaps for projects with work starting in [from, to), including ones not written yet. Each is
 * compared with the work as it is now, so one written before more work came in shows as stale.
 */
export function projectRecaps(
  db: Database,
  summaries: SummaryState,
  from: number,
  to: number,
): Recap[] {
  const stored = db.query<StoredRecap, [number, number, number]>(
    `SELECT body, model, input_hash, created_at FROM recaps
     WHERE project_id = ? AND period_from = ? AND period_to = ?`,
  );
  return recapProjects(db, from, to).flatMap((id) => {
    const target = { projectId: id, from, to };
    const input = loadRecapInput(db, target);
    if (!input) return [];
    const row = stored.get(id, from, to);
    return [
      {
        ...target,
        body: row?.body ?? null,
        model: row?.model ?? null,
        createdAt: row?.created_at ?? null,
        stale: row ? row.input_hash !== recapHash(input) : false,
        pending: summaries.isRecapPending(target),
        error: summaries.recapErrorOf(target),
      },
    ];
  });
}

/** Projects with human work starting in [from, to), by id. */
function recapProjects(db: Database, from: number, to: number): number[] {
  // Recaps tell what you did, so like loadRecapInput they leave headless sessions out
  return db
    .query<{ id: number }, [number, number]>(
      `SELECT DISTINCT s.project_id AS id FROM segments g JOIN sessions s ON s.id = g.session_id
       WHERE s.prompt_count > 0 AND s.project_id IS NOT NULL AND g.start >= ? AND g.start < ?
       ORDER BY s.project_id`,
    )
    .all(from, to)
    .map((r) => r.id);
}
