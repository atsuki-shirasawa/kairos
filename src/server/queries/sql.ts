// SQL conditions several query modules share, so they can't drift apart.
import type { Artifact } from "../../shared/api.ts";

/**
 * One session's own rows within a time range, leaving out copies from the session it continued.
 * Binds ?1 = session id, ?2 = from, ?3 = to (inclusive), so callers number any further parameters
 * from ?4.
 */
export const OWN_ROWS_IN_RANGE = "session_id = ?1 AND is_copy = 0 AND ts BETWEEN ?2 AND ?3";

/** Artifact kinds a session or block lists (merges are only counted). */
const LISTED_ARTIFACT_KINDS: readonly Artifact["kind"][] = ["pr", "commit"];

/**
 * Condition on the artifacts table (aliased `alias`, if given) keeping the commits and PRs a
 * session made itself, not copies from the session it continued.
 */
export function listedArtifactsSql(alias?: string): string {
  const column = (c: string) => (alias ? `${alias}.${c}` : c);
  const kinds = LISTED_ARTIFACT_KINDS.map((k) => `'${k}'`).join(", ");
  return `${column("kind")} IN (${kinds}) AND ${column("is_copy")} = 0`;
}
