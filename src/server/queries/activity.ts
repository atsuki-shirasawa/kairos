// What was done within work blocks: tool calls, edits, errors, commits and PRs, and Claude's time.
// Subagents are included and copies in a continued session left out throughout. Each count is one
// query over a whole set of blocks (see `BlockSet`), not one per block.
import type { Database } from "bun:sqlite";
import type { Activity, Artifact } from "../../shared/api.ts";
import { sqlList } from "../db/sqlList.ts";
import { EDIT_TOOL_NAMES } from "../editTools.ts";
import {
  BLOCK_COLUMNS,
  type BlockLookup,
  type BlockRef,
  type BlockSet,
  byBlock,
  groupByBlock,
  listedArtifactsSql,
  lookupByBlock,
  ownOutputsInBlock,
  ownRowsInBlock,
  valueByBlock,
  withBlocks,
} from "./sql.ts";

/**
 * `Activity` without the effort level, which comes from the usage rows (`blocksTokens`) and is
 * joined in by `blocksFacts`.
 */
export type BlockActivity = Omit<Activity, "effort">;

/** The part of `Activity` counted from artifacts. */
type ArtifactCounts = Pick<Activity, "commits" | "prs" | "merges">;
/** The part of `Activity` counted from messages by the index alone (files edited need the text). */
type MessageCounts = Omit<BlockActivity, keyof ArtifactCounts | "claudeMs" | "filesEdited">;

/** Activity of a block with nothing recorded in it. */
const NO_ACTIVITY: BlockActivity = {
  commits: 0,
  prs: 0,
  merges: 0,
  filesEdited: 0,
  toolCalls: 0,
  subagents: 0,
  toolErrors: 0,
  interrupts: 0,
  apiErrors: 0,
  compactions: 0,
  claudeMs: null,
};

/** What was done within each block of the set (including subagents, excluding copies in continued sessions). */
export function blocksActivity(db: Database, set: BlockSet): BlockLookup<BlockActivity> {
  const messages = messageCounts(db, set);
  const files = filesEdited(db, set);
  const artifacts = artifactCounts(db, set);
  const claude = claudeMs(db, set);
  const keys = new Set([
    ...messages.keys(),
    ...files.keys(),
    ...artifacts.keys(),
    ...claude.keys(),
  ]);
  const activity = new Map(
    [...keys].map((key) => [
      key,
      {
        ...NO_ACTIVITY,
        ...messages.get(key),
        ...artifacts.get(key),
        filesEdited: files.get(key) ?? 0,
        claudeMs: claude.get(key) ?? null,
      },
    ]),
  );
  return lookupByBlock(activity, NO_ACTIVITY);
}

/** A work block's commits and PRs, each in time order. */
export interface BlockArtifacts {
  prs: Artifact[];
  commits: Artifact[];
}

/**
 * Commits and PRs made within each block of the set (counted the same way as `blocksActivity`),
 * in one query.
 */
export function blocksArtifacts(db: Database, set: BlockSet): BlockLookup<BlockArtifacts> {
  const rows = db
    .query<Artifact & BlockRef, (string | number)[]>(
      `${withBlocks(set)}
       SELECT ${BLOCK_COLUMNS}, a.kind, a.ref, a.title, a.ts
       FROM b CROSS JOIN artifacts a ON ${ownOutputsInBlock("a")}
       WHERE ${listedArtifactsSql("a")}
       ORDER BY a.ts`,
    )
    .all(...set.params);
  const artifacts = new Map(
    [...groupByBlock(rows)].map(([key, block]) => {
      const list = block.map(({ sessionId: _, blockStart: __, ...artifact }) => artifact);
      return [
        key,
        { prs: list.filter((a) => a.kind === "pr"), commits: list.filter((a) => a.kind !== "pr") },
      ];
    }),
  );
  return lookupByBlock(artifacts, { prs: [], commits: [] });
}

/**
 * The activity counts that come from messages (tool calls, errors, ...). Reads only columns the
 * `messages_block` index holds, so it never touches the table's rows; files edited need the text and
 * are counted apart in `filesEdited`.
 */
function messageCounts(db: Database, set: BlockSet): Map<string, MessageCounts> {
  return byBlock(
    db
      .query<MessageCounts & BlockRef, (string | number)[]>(
        `${withBlocks(set)}
         SELECT ${BLOCK_COLUMNS},
                SUM(m.kind = 'tool_use') AS toolCalls,
                SUM(m.kind = 'tool_use' AND m.agent_id IS NULL AND m.tool_name IN ('Agent', 'Task')) AS subagents,
                SUM(m.kind = 'tool_result' AND m.is_error = 1) AS toolErrors,
                SUM(m.kind = 'interrupt') AS interrupts,
                SUM(m.kind = 'error') AS apiErrors,
                SUM(m.kind = 'compact') AS compactions
         FROM b CROSS JOIN messages m ON ${ownRowsInBlock("m")}
         GROUP BY b.session_id, b.start`,
      )
      .all(...set.params),
  );
}

/** Distinct files edited in each block; the edit's text is its path. A block with none is missing. */
function filesEdited(db: Database, set: BlockSet): Map<string, number> {
  // Filtered on indexed columns first, so only the edits' rows are read for their text
  const rows = db
    .query<{ files: number } & BlockRef, (string | number)[]>(
      `${withBlocks(set)}
       SELECT ${BLOCK_COLUMNS}, COUNT(DISTINCT m.text) AS files
       FROM b CROSS JOIN messages m ON ${ownRowsInBlock("m")}
       WHERE m.kind = 'tool_use' AND m.tool_name IN ${sqlList(EDIT_TOOL_NAMES)} AND m.text != ''
       GROUP BY b.session_id, b.start`,
    )
    .all(...set.params);
  return valueByBlock(rows, "files");
}

/** Commits, PRs and merges within each block, allowing for ones recorded just after it ends. */
function artifactCounts(db: Database, set: BlockSet): Map<string, ArtifactCounts> {
  return byBlock(
    db
      .query<ArtifactCounts & BlockRef, (string | number)[]>(
        `${withBlocks(set)}
         SELECT ${BLOCK_COLUMNS}, SUM(a.kind = 'commit') AS commits, SUM(a.kind = 'pr') AS prs,
                SUM(a.kind = 'merge') AS merges
         FROM b CROSS JOIN artifacts a ON ${ownOutputsInBlock("a")}
         GROUP BY b.session_id, b.start`,
      )
      .all(...set.params),
  );
}

/** Time Claude spent on turns ending inside each block; a block with no timed turn is missing. */
function claudeMs(db: Database, set: BlockSet): Map<string, number> {
  // A turn starts and ends within one block, so its end places it
  const rows = db
    .query<{ ms: number } & BlockRef, (string | number)[]>(
      `${withBlocks(set)}
       SELECT ${BLOCK_COLUMNS}, SUM(t.duration_ms) AS ms
       FROM b CROSS JOIN turns t ON ${ownRowsInBlock("t")}
       GROUP BY b.session_id, b.start`,
    )
    .all(...set.params);
  return valueByBlock(rows, "ms");
}
