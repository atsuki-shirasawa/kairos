import type { Database, Statement } from "bun:sqlite";

/** Saved resume point and interpretation state of one log file (a row of ingest_state). */
export interface StateRow {
  id: number;
  offset: number;
  ino: number | null;
  parser_version: number;
  state: string;
}

/** Startup facts of a session that are recorded only once. */
export interface SessionInfoRow {
  launch_cwd: string | null;
  branch: string | null;
}

/** Session-level aggregates over its own (non-copied) main-thread messages. */
export interface AggregateRow {
  started: number | null;
  ended: number | null;
  prompts: number;
  scheduled: number;
}

/** A main-thread message used to compute work blocks and their fallback titles. */
export interface ActivityRow {
  ts: number;
  is_scheduled: number;
  kind: string;
  text: string | null;
}

/** Session columns written from meta records. */
export const SESSION_FIELDS = [
  "ai_title",
  "agent_name",
  "custom_title",
  "away_summary",
  "continued_in",
  "label",
] as const;
/** A session column written from meta records. */
export type SessionField = (typeof SESSION_FIELDS)[number];

/** One `UPDATE sessions SET <col> = ? WHERE id = ?` per meta column, prepared once. */
export function prepareSessionSetters(db: Database): Record<SessionField, Statement> {
  return Object.fromEntries(
    SESSION_FIELDS.map((col) => [col, db.prepare(`UPDATE sessions SET ${col} = ? WHERE id = ?`)]),
  ) as Record<SessionField, Statement>;
}

/** Prepared statements the ingester runs, prepared once per Ingester. */
export type Statements = ReturnType<typeof prepareStatements>;

/** Prepares every statement the ingester runs, so per-record work does not recompile SQL. */
export function prepareStatements(db: Database) {
  const p = (sql: string) => db.prepare(sql);
  return {
    getState: p("SELECT id, offset, ino, parser_version, state FROM ingest_state WHERE path = ?"),
    insertState: p(
      "INSERT INTO ingest_state (path, session_id, agent_id, parser_version) VALUES (?, ?, ?, ?) RETURNING id",
    ),
    saveState: p(
      "UPDATE ingest_state SET offset = ?, size = ?, ino = ?, parser_version = ?, state = ? WHERE id = ?",
    ),
    deleteState: p("DELETE FROM ingest_state WHERE id = ?"),
    clearFile: p("DELETE FROM messages WHERE file_id = ?"),
    clearFileArtifacts: p("DELETE FROM artifacts WHERE file_id = ?"),
    clearFileUsage: p("DELETE FROM usage WHERE file_id = ?"),
    clearFileTurns: p("DELETE FROM turns WHERE file_id = ?"),
    ensureSession: p("INSERT OR IGNORE INTO sessions (id) VALUES (?)"),
    sessionInfo: p("SELECT launch_cwd, branch FROM sessions WHERE id = ?"),
    upsertProject: p(
      "INSERT INTO projects (path, name, repo) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET name = name RETURNING id",
    ),
    projectByRepo: p("SELECT id FROM projects WHERE repo = ?"),
    projectByPath: p("SELECT id FROM projects WHERE path = ?"),
    adoptRepo: p("UPDATE projects SET repo = ?, name = ? WHERE id = ?"),
    reassignProject: p(
      "UPDATE sessions SET project_id = ?, label = COALESCE(label, ?) WHERE launch_cwd = ?",
    ),
    deleteOrphanProjects: p(
      "DELETE FROM projects WHERE id NOT IN (SELECT project_id FROM sessions WHERE project_id IS NOT NULL)",
    ),
    setLaunch: p(
      "UPDATE sessions SET launch_cwd = ?, project_id = ?, label = COALESCE(label, ?) WHERE id = ? AND launch_cwd IS NULL",
    ),
    setBranch: p("UPDATE sessions SET branch = ? WHERE id = ? AND branch IS NULL"),
    insertMessage: p(
      `INSERT OR IGNORE INTO messages
         (id, session_id, agent_id, file_id, seq, ts, kind, text, tool_name, tool_use_id, is_error, is_scheduled, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    upsertPrTitle: p(
      `INSERT INTO artifacts (session_id, kind, ref, title, ts, file_id) VALUES (?, 'pr', ?, ?, ?, ?)
       ON CONFLICT(session_id, kind, ref) DO UPDATE SET title = excluded.title`,
    ),
    insertArtifact: p(
      "INSERT OR IGNORE INTO artifacts (session_id, kind, ref, title, ts, file_id) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    upsertUsage: p(
      `INSERT INTO usage (session_id, message_id, agent_id, file_id, ts, model, speed, effort,
                          input, output, cache_read, cache_write_5m, cache_write_1h)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, message_id) DO UPDATE SET output = MAX(output, excluded.output)`,
    ),
    upsertSubagent: p(
      `INSERT INTO subagents (id, session_id, agent_type, description, tool_use_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET agent_type = excluded.agent_type, description = excluded.description,
           tool_use_id = excluded.tool_use_id`,
    ),
    // Mark records in the continued session (?1) that share a uuid with the previous session as copies
    markCopiedMessages: p(
      `UPDATE messages SET is_copy = EXISTS (
         SELECT 1 FROM messages m JOIN sessions prev ON prev.id = m.session_id
         WHERE prev.continued_in = ?1 AND m.id = messages.id)
       WHERE session_id = ?1`,
    ),
    markCopiedArtifacts: p(
      `UPDATE artifacts SET is_copy = EXISTS (
         SELECT 1 FROM artifacts a JOIN sessions prev ON prev.id = a.session_id
         WHERE prev.continued_in = ?1 AND a.kind = artifacts.kind AND a.ref = artifacts.ref)
       WHERE session_id = ?1`,
    ),
    markCopiedUsage: p(
      `UPDATE usage SET is_copy = EXISTS (
         SELECT 1 FROM usage u JOIN sessions prev ON prev.id = u.session_id
         WHERE prev.continued_in = ?1 AND u.message_id = usage.message_id)
       WHERE session_id = ?1`,
    ),
    insertTurn: p(
      "INSERT OR IGNORE INTO turns (session_id, id, file_id, ts, duration_ms) VALUES (?, ?, ?, ?, ?)",
    ),
    markCopiedTurns: p(
      `UPDATE turns SET is_copy = EXISTS (
         SELECT 1 FROM turns t JOIN sessions prev ON prev.id = t.session_id
         WHERE prev.continued_in = ?1 AND t.id = turns.id)
       WHERE session_id = ?1`,
    ),
    hasPredecessor: p("SELECT 1 FROM sessions WHERE continued_in = ? LIMIT 1"),
    // ID of the continuing session, if it is in the DB
    continuedIn: p(
      "SELECT s.continued_in AS id FROM sessions s JOIN sessions next ON next.id = s.continued_in WHERE s.id = ?",
    ),
    aggregate: p(
      `SELECT MIN(ts) AS started, MAX(ts) AS ended,
                COALESCE(SUM(kind IN ('prompt', 'command')), 0) AS prompts,
                COALESCE(SUM(kind = 'scheduled'), 0) AS scheduled
         FROM messages WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0`,
    ),
    firstPrompt: p(
      "SELECT text FROM messages WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0 AND kind = 'prompt' ORDER BY file_id, seq LIMIT 1",
    ),
    updateAggregate: p(
      "UPDATE sessions SET started_at = ?, ended_at = ?, prompt_count = ?, scheduled_runs = ?, first_prompt = ? WHERE id = ?",
    ),
    // Activity used to compute work blocks. For headlines, also take the start of prompt and reply text
    activity: p(
      `SELECT ts, is_scheduled, kind,
              CASE WHEN kind IN ('prompt', 'command', 'assistant') THEN substr(text, 1, 400) END AS text
       FROM messages WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0 AND ts IS NOT NULL ORDER BY ts, file_id, seq`,
    ),
    clearSegments: p("DELETE FROM segments WHERE session_id = ?"),
    insertSegment: p(
      "INSERT OR IGNORE INTO segments (session_id, start, end, prompt_count, fallback_title) VALUES (?, ?, ?, ?, ?)",
    ),
  };
}
