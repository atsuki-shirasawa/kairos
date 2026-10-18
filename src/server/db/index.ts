import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Migrations. Index + 1 is the schema version (`PRAGMA user_version`).
 * Never rewrite existing entries; append changes at the end.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE projects (
    id      INTEGER PRIMARY KEY,
    path    TEXT NOT NULL UNIQUE,
    name    TEXT NOT NULL,
    color   TEXT,
    hidden  INTEGER NOT NULL DEFAULT 0
  );

  -- Ingested files and the state for resuming reads
  CREATE TABLE ingest_state (
    id              INTEGER PRIMARY KEY,
    path            TEXT NOT NULL UNIQUE,
    session_id      TEXT NOT NULL,
    agent_id        TEXT,
    offset          INTEGER NOT NULL DEFAULT 0,
    size            INTEGER NOT NULL DEFAULT 0,
    ino             INTEGER,
    parser_version  INTEGER NOT NULL,
    state           TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    project_id      INTEGER REFERENCES projects(id),
    launch_cwd      TEXT,
    label           TEXT,
    branch          TEXT,
    custom_title    TEXT,
    agent_name      TEXT,
    ai_title        TEXT,
    first_prompt    TEXT,
    away_summary    TEXT,
    continued_in    TEXT,
    started_at      INTEGER,
    ended_at        INTEGER,
    prompt_count    INTEGER NOT NULL DEFAULT 0,
    scheduled_runs  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX sessions_time ON sessions(started_at, ended_at);
  CREATE INDEX sessions_continued ON sessions(continued_in);

  CREATE TABLE subagents (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_type    TEXT,
    description   TEXT,
    tool_use_id   TEXT
  );

  -- id is the record uuid (+ block index). A continued session starts with copies of the previous session's
  -- records under the same uuids, so uniqueness is per session. Copies get is_copy = 1 and are left out of totals.
  -- seq is the order within the file (line byte offset * 16 + block index)
  CREATE TABLE messages (
    id            TEXT NOT NULL,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id      TEXT,
    file_id       INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    ts            INTEGER,
    kind          TEXT NOT NULL,
    text          TEXT,
    tool_name     TEXT,
    tool_use_id   TEXT,
    is_error      INTEGER NOT NULL DEFAULT 0,
    is_scheduled  INTEGER NOT NULL DEFAULT 0,
    is_copy       INTEGER NOT NULL DEFAULT 0,
    meta          TEXT,
    PRIMARY KEY (session_id, id)
  );
  CREATE INDEX messages_order ON messages(session_id, agent_id, file_id, seq);
  CREATE INDEX messages_time ON messages(session_id, ts);

  CREATE TABLE artifacts (
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    ref         TEXT NOT NULL,
    title       TEXT,
    ts          INTEGER,
    file_id     INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    is_copy     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, kind, ref)
  );

  CREATE TABLE segments (
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start       INTEGER NOT NULL,
    end         INTEGER NOT NULL,
    PRIMARY KEY (session_id, start)
  );
  CREATE INDEX segments_time ON segments(start, end);

  CREATE TABLE summaries (
    session_id     TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    headline       TEXT NOT NULL,
    body           TEXT NOT NULL,
    model          TEXT NOT NULL,
    covered_until  INTEGER,
    created_at     INTEGER NOT NULL
  );
  `,
  // 2: summaries per section (work block) instead of per session
  `
  ALTER TABLE segments ADD COLUMN prompt_count INTEGER NOT NULL DEFAULT 0;
  -- Headline for short sections not summarized by the LLM (first prompt, else Claude's last reply)
  ALTER TABLE segments ADD COLUMN fallback_title TEXT;

  DROP TABLE summaries;
  CREATE TABLE summaries (
    session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start          INTEGER NOT NULL,
    headline       TEXT NOT NULL,
    body           TEXT NOT NULL,
    model          TEXT NOT NULL,
    covered_until  INTEGER NOT NULL,
    created_at     INTEGER NOT NULL,
    PRIMARY KEY (session_id, start)
  );

  -- Small settings (derived-data version etc.)
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // 3: group directories of the same git repository (other clones etc.) into one project
  `
  -- Key taken from the remote (github.com/owner/repo). Never includes credentials
  ALTER TABLE projects ADD COLUMN repo TEXT;
  CREATE UNIQUE INDEX projects_repo ON projects(repo) WHERE repo IS NOT NULL;
  `,
  // 4: token usage. One response is split into a record per block, so keep one row per message.id
  `
  CREATE TABLE usage (
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id      TEXT NOT NULL,
    agent_id        TEXT,
    file_id         INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    ts              INTEGER,
    model           TEXT NOT NULL,
    speed           TEXT,
    input           INTEGER NOT NULL,
    output          INTEGER NOT NULL,
    cache_read      INTEGER NOT NULL,
    cache_write_5m  INTEGER NOT NULL,
    cache_write_1h  INTEGER NOT NULL,
    is_copy         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, message_id)
  );
  CREATE INDEX usage_time ON usage(session_id, ts);
  `,
  // 5: response effort, and turn duration (time Claude was working)
  `
  ALTER TABLE usage ADD COLUMN effort TEXT;

  -- system/turn_duration. ts is the end of the turn. Copied into continued sessions under the same uuid
  CREATE TABLE turns (
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    id           TEXT NOT NULL,
    file_id      INTEGER NOT NULL REFERENCES ingest_state(id) ON DELETE CASCADE,
    ts           INTEGER NOT NULL,
    duration_ms  INTEGER NOT NULL,
    is_copy      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, id)
  );
  CREATE INDEX turns_time ON turns(session_id, ts);
  `,
  // 6: LLM-written recap of what was done on a project during a shown period (a week or a day).
  // Made only on request from the summary view, from the period's section summaries (not raw logs).
  // input_hash fingerprints that input, so a recap whose sections changed since can show as stale
  `
  CREATE TABLE recaps (
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    period_from  INTEGER NOT NULL,
    period_to    INTEGER NOT NULL,
    body         TEXT NOT NULL,
    model        TEXT NOT NULL,
    input_hash   TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (project_id, period_from, period_to)
  );
  `,
  // 7: requests given through the SDK (`claude -p`), which make a session with no human prompts
  // a headless one. Existing rows are filled when the DERIVED_VERSION bump recomputes aggregates
  `
  ALTER TABLE sessions ADD COLUMN sdk_prompt_count INTEGER NOT NULL DEFAULT 0;
  `,
  // 8: no schema change. Summaries written before parseSummary skipped code fences have a fence
  // ("```") as their headline (#29). Their shapes vary, so rather than repairing them here, delete
  // them: the summarizer takes sections without a summary again (recent ones automatically, older
  // ones with `kairos summarize` or from the drawer), and until then the fallback title shows
  `
  DELETE FROM summaries WHERE trim(headline) GLOB '\`\`\`*' OR trim(headline) GLOB '~~~*';
  `,
  // 9: open items carried across sections and sessions (#35). Filled from each section summary's
  // Open item when the section is summarized; nothing is filled for summaries written before.
  // The project comes from the session at read time, since project assignment is recomputed.
  // closed_by: 'ref' when the log shows the issue closed, the PR merged or the task completed
  // (recomputable, so kept when a section is regenerated); 'model' when a later section's summary
  // said it settled the item (rewritten when that section is regenerated)
  `
  CREATE TABLE open_items (
    id                 INTEGER PRIMARY KEY,
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start              INTEGER NOT NULL,
    -- End of the section as summarized; only what happens after it can close the item
    opened_at          INTEGER NOT NULL,
    kind               TEXT,
    text               TEXT NOT NULL,
    -- JSON array of the issue / PR numbers ("#12"), Jira keys and task IDs ("task:3") it names
    refs               TEXT NOT NULL DEFAULT '[]',
    closed_at          INTEGER,
    closed_session_id  TEXT,
    closed_start       INTEGER,
    closed_by          TEXT,
    closed_note        TEXT
  );
  CREATE INDEX open_items_section ON open_items(session_id, start);
  CREATE INDEX open_items_closed_in ON open_items(closed_session_id, closed_start);
  `,
  // 10: usage by time across sessions, for the live page's spend band (today, the last 15
  // minutes and the last three hours over every visible session, on each refetch)
  `
  CREATE INDEX usage_ts ON usage(ts);
  `,
  // 11: every hand edit of an open item (#40): done, dismissed, mistaken (the summary listed
  // something that was never open) or reopened. The ledger keeps only an item's latest state and
  // rewrites its rows when the section is summarized again, so this log is where the decisions
  // and their undos stay, as data for judging the summaries. It copies the item's section, kind
  // and text rather than referencing it, so a decision outlives the row it was made on.
  `
  CREATE TABLE open_item_decisions (
    id          INTEGER PRIMARY KEY,
    item_id     INTEGER NOT NULL,
    session_id  TEXT NOT NULL,
    start       INTEGER NOT NULL,
    kind        TEXT,
    text        TEXT NOT NULL,
    -- 'done' / 'dismissed' / 'mistaken', or 'open' for an undo
    state       TEXT NOT NULL,
    at          INTEGER NOT NULL
  );
  CREATE INDEX open_item_decisions_item ON open_item_decisions(item_id);
  `,
  // 12: the calendar counts every block's tool calls, errors and the like in one query over the
  // period (#46). With the columns those counts read in the index, it runs on the index alone
  // instead of reading each message's row, text and all. It starts with (session_id, ts), so it
  // also serves every lookup messages_time did, which goes.
  `
  CREATE INDEX messages_block ON messages(session_id, ts, is_copy, kind, tool_name, is_error, agent_id);
  DROP INDEX messages_time;
  `,
  // 13: work blocks get an id that survives recomputation (#49). Summaries and open items were
  // keyed by (session_id, start), so a block whose start moved left its summary behind; derived
  // data now carries each block's id over to the new block it overlaps most. (session_id, start)
  // stays unique: URLs and the API still name a block by its session and start.
  // covered_from is the block's start when summarized, so a summary is stale once the block
  // starts elsewhere as well as once it runs past covered_until.
  // A summary or open item whose block's start had already moved goes to the block it overlaps
  // most; one overlapping none is dropped.
  `
  CREATE TABLE segments_new (
    id              INTEGER PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start           INTEGER NOT NULL,
    end             INTEGER NOT NULL,
    prompt_count    INTEGER NOT NULL DEFAULT 0,
    fallback_title  TEXT,
    UNIQUE (session_id, start)
  );
  INSERT INTO segments_new (session_id, start, end, prompt_count, fallback_title)
    SELECT session_id, start, end, prompt_count, fallback_title FROM segments ORDER BY start;
  DROP TABLE segments;
  ALTER TABLE segments_new RENAME TO segments;
  CREATE INDEX segments_time ON segments(start, end);

  CREATE TABLE summaries_new (
    block_id        INTEGER PRIMARY KEY REFERENCES segments(id) ON DELETE CASCADE,
    headline        TEXT NOT NULL,
    body            TEXT NOT NULL,
    model           TEXT NOT NULL,
    covered_from    INTEGER NOT NULL,
    covered_until   INTEGER NOT NULL,
    created_at      INTEGER NOT NULL
  );
  -- Each summary goes to the block at its start, else the one it overlaps most (ranked with a
  -- window, as SQLite before 3.4x can't read sm from a subquery's ORDER BY inside a JOIN). Summaries
  -- of the block at their own start go first, so one whose block moved never displaces it
  INSERT OR IGNORE INTO summaries_new
    (block_id, headline, body, model, covered_from, covered_until, created_at)
    SELECT block_id, headline, body, model, start, covered_until, created_at FROM (
      SELECT g.id AS block_id, g.start = sm.start AS own, sm.headline, sm.body, sm.model, sm.start,
             sm.covered_until, sm.created_at,
             ROW_NUMBER() OVER (PARTITION BY sm.session_id, sm.start
               ORDER BY g.start = sm.start DESC,
                 MIN(g.end, sm.covered_until) - MAX(g.start, sm.start) DESC) AS rank
      FROM summaries sm
      JOIN segments g ON g.session_id = sm.session_id
        AND (g.start = sm.start OR (g.start <= sm.covered_until AND g.end >= sm.start)))
    WHERE rank = 1
    ORDER BY own DESC;
  DROP TABLE summaries;
  ALTER TABLE summaries_new RENAME TO summaries;

  CREATE TABLE open_items_new (
    id               INTEGER PRIMARY KEY,
    block_id         INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    -- End of the block as summarized; only what happens after it can close the item
    opened_at        INTEGER NOT NULL,
    kind             TEXT,
    text             TEXT NOT NULL,
    -- JSON array of the issue / PR numbers ("#12"), Jira keys and task IDs ("task:3") it names
    refs             TEXT NOT NULL DEFAULT '[]',
    closed_at        INTEGER,
    -- The block that closed it; null when closed by hand, outside any block, or its block is gone
    closed_block_id  INTEGER REFERENCES segments(id) ON DELETE SET NULL,
    closed_by        TEXT,
    closed_note      TEXT
  );
  -- An item goes to the block its summary's start is in (else the one it overlaps most), and its
  -- close to the block the closing summary's start is in (else the nearest after it); ranked with
  -- windows for the SQLite versions that can't read i from a subquery's ORDER BY
  WITH opened AS (
    SELECT i.id, g.id AS block_id,
           ROW_NUMBER() OVER (PARTITION BY i.id
             ORDER BY g.start = i.start DESC,
               MIN(g.end, i.opened_at) - MAX(g.start, i.start) DESC) AS rank
    FROM open_items i
    JOIN segments g ON g.session_id = i.session_id
      AND (g.start = i.start OR (g.start <= i.opened_at AND g.end >= i.start))
  ), closed AS (
    SELECT i.id, g.id AS block_id,
           ROW_NUMBER() OVER (PARTITION BY i.id
             ORDER BY g.start <= i.closed_start DESC,
               CASE WHEN g.start <= i.closed_start THEN -g.start ELSE g.start END) AS rank
    FROM open_items i
    JOIN segments g ON g.session_id = i.closed_session_id
  )
  INSERT INTO open_items_new
    (id, block_id, opened_at, kind, text, refs, closed_at, closed_block_id, closed_by, closed_note)
    SELECT i.id, o.block_id, i.opened_at, i.kind, i.text, i.refs, i.closed_at, c.block_id,
           i.closed_by, i.closed_note
    FROM open_items i
    JOIN opened o ON o.id = i.id AND o.rank = 1
    LEFT JOIN closed c ON c.id = i.id AND c.rank = 1;
  -- A summary's close stands only while its block does
  UPDATE open_items_new SET closed_at = NULL, closed_by = NULL, closed_note = NULL
    WHERE closed_by = 'model' AND closed_block_id IS NULL;
  DROP TABLE open_items;
  ALTER TABLE open_items_new RENAME TO open_items;
  CREATE INDEX open_items_block ON open_items(block_id);
  CREATE INDEX open_items_closed_in ON open_items(closed_block_id);
  `,
  // 14: how each summary was written (#50). The model now answers in JSON checked against a schema,
  // with a short title for week blocks. prompt_version is PROMPT_VERSION of the prompt that wrote
  // it, null for the free-Markdown summaries before it; input_hash is the prompt's hash; tokens,
  // cost (list price, a gauge like pricing.ts) and latency come from claude -p's JSON envelope.
  // All stay null for summaries written before, which can't be measured after the fact.
  `
  ALTER TABLE summaries ADD COLUMN short TEXT;
  ALTER TABLE summaries ADD COLUMN prompt_version INTEGER;
  ALTER TABLE summaries ADD COLUMN input_hash TEXT;
  ALTER TABLE summaries ADD COLUMN input_tokens INTEGER;
  ALTER TABLE summaries ADD COLUMN output_tokens INTEGER;
  ALTER TABLE summaries ADD COLUMN cost_usd REAL;
  ALTER TABLE summaries ADD COLUMN latency_ms INTEGER;
  `,
  // 15: sessions by when they last moved, for the home page's Pick up (#56): sessions active in
  // the last week and when each project last moved, refetched on every summary and turn
  `
  CREATE INDEX sessions_ended ON sessions(ended_at);
  `,
  // 16: a trigram index over what search reads in messages (#61): the prompts and replies of the
  // main conversation, by far the most text it looks at, without copies (a continued session's
  // repeat of the earlier one, marked after insert). Search narrows the messages with it and LIKE
  // still decides, so results don't change. Trigrams match any substring of 3+ characters,
  // Japanese included. The table keeps its own copy of the text (about a tenth of messages' text,
  // most of which is tool output), so a term too short for trigrams scans that copy instead, and
  // each message's key, which search joins on: messages has no INTEGER PRIMARY KEY, so its rowid
  // (used here only to find the row to drop) isn't promised to survive a rebuild of the file.
  // Triggers keep it in step as ingest inserts, marks copies and clears files (FK cascades fire
  // them too). Filled here from what was already ingested.
  `
  CREATE VIRTUAL TABLE message_text USING fts5(
    text, session_id UNINDEXED, id UNINDEXED, tokenize='trigram'
  );
  INSERT INTO message_text(rowid, text, session_id, id)
    SELECT rowid, text, session_id, id FROM messages
     WHERE kind IN ('prompt', 'sdk_prompt', 'assistant') AND agent_id IS NULL
       AND is_copy = 0 AND text != '';
  CREATE TRIGGER message_text_insert AFTER INSERT ON messages
    WHEN new.kind IN ('prompt', 'sdk_prompt', 'assistant') AND new.agent_id IS NULL
     AND new.is_copy = 0 AND new.text != ''
  BEGIN
    INSERT OR REPLACE INTO message_text(rowid, text, session_id, id)
      VALUES (new.rowid, new.text, new.session_id, new.id);
  END;
  CREATE TRIGGER message_text_delete AFTER DELETE ON messages
  BEGIN
    DELETE FROM message_text WHERE rowid = old.rowid;
  END;
  CREATE TRIGGER message_text_update AFTER UPDATE OF text, kind, agent_id, is_copy ON messages
    WHEN old.text IS NOT new.text OR old.kind IS NOT new.kind
      OR old.agent_id IS NOT new.agent_id OR old.is_copy IS NOT new.is_copy
  BEGIN
    DELETE FROM message_text WHERE rowid = old.rowid;
    INSERT OR REPLACE INTO message_text(rowid, text, session_id, id)
      SELECT new.rowid, new.text, new.session_id, new.id
       WHERE new.kind IN ('prompt', 'sdk_prompt', 'assistant') AND new.agent_id IS NULL
         AND new.is_copy = 0 AND new.text != '';
  END;
  `,
];

/** Schema version once every migration is applied (stored in `PRAGMA user_version`). */
export const SCHEMA_VERSION = MIGRATIONS.length;

/** Opens the DB and applies pending migrations. `:memory:` works too (for tests). */
export function openDb(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.run(MIGRATIONS[v] ?? "");
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}
