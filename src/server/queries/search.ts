// Search across work blocks: splitting the query into terms, the LIKE scan's SQL, and turning a
// matching row into an API hit, and `searchBlocks`, which runs it against the database.

import type { Database } from "bun:sqlite";
import type { SearchField, SearchHit } from "../../shared/api.ts";
import { ARTIFACT_GRACE_MS } from "../../shared/constants.ts";
import { EDIT_TOOLS } from "./editTools.ts";
import { listedArtifactsSql } from "./sql.ts";
import { sectionHeadline, title } from "./titles.ts";

/** Sections returned per search; `more` tells the UI that further ones matched. */
export const SEARCH_LIMIT = 50;
/** Extra terms add little and each one is another scan condition. */
const SEARCH_MAX_TERMS = 5;
/** Search fields, most telling first. A hit reports the first of these that matched. */
const SEARCH_FIELDS: SearchField[] = [
  "headline",
  "summary",
  "pr",
  "commit",
  "title",
  "branch",
  "prompt",
  "reply",
  "file",
];
/** A term written as `file:<path>` matches only the paths of files edited in a block. */
const FILE_PREFIX = "file:";
/** Length of a hit's snippet, before the ellipses. */
const SNIPPET_CHARS = 120;

/** Every place a section can match, as (session, section start, field, text) rows. */
const SEARCH_SOURCES = `
      SELECT g.session_id AS sid, g.start, 'headline' AS field, COALESCE(sm.headline, g.fallback_title) AS text
        FROM segments g LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start
      UNION ALL
      SELECT session_id, start, 'summary', body FROM summaries WHERE body != ''
      UNION ALL
      SELECT g.session_id, g.start, 'title',
             COALESCE(s.custom_title, '') || char(10) || COALESCE(s.agent_name, '') || char(10) ||
             COALESCE(s.ai_title, '') || char(10) || COALESCE(s.label, '')
        FROM segments g JOIN sessions s ON s.id = g.session_id
      UNION ALL
      SELECT g.session_id, g.start, 'branch', s.branch
        FROM segments g JOIN sessions s ON s.id = g.session_id WHERE s.branch != 'HEAD'
      UNION ALL
      SELECT g.session_id, g.start, a.kind, COALESCE(a.title, '') || char(10) || a.ref
        FROM artifacts a JOIN segments g ON g.session_id = a.session_id
         AND a.ts BETWEEN g.start AND g.end + ${ARTIFACT_GRACE_MS}
       WHERE ${listedArtifactsSql("a")}
      UNION ALL
      SELECT g.session_id, g.start, CASE m.kind WHEN 'assistant' THEN 'reply' ELSE 'prompt' END, m.text
        FROM messages m JOIN segments g ON g.session_id = m.session_id AND m.ts BETWEEN g.start AND g.end
       WHERE m.kind IN ('prompt', 'sdk_prompt', 'assistant') AND m.agent_id IS NULL AND m.is_copy = 0`;

/**
 * Paths of files edited in each section, subagents included, as `filesEdited` counts them.
 * Joined only for `file:` terms: plain terms never look at it, and it is another messages scan.
 */
const FILE_SOURCE = `
      UNION ALL
      SELECT g.session_id, g.start, 'file', m.text
        FROM messages m JOIN segments g ON g.session_id = m.session_id AND m.ts BETWEEN g.start AND g.end
       WHERE m.kind = 'tool_use' AND m.tool_name IN (${EDIT_TOOLS}) AND m.text != '' AND m.is_copy = 0`;

/** CASE arms ordering fields by `SEARCH_FIELDS`, so the most telling match comes first. */
const SEARCH_FIELD_RANK = SEARCH_FIELDS.map((f, i) => `WHEN '${f}' THEN ${i}`).join(" ");

/** A matching section with the session fields its headline falls back to. */
export interface SearchRow {
  sid: string;
  start: number;
  end: number;
  project_id: number | null;
  label: string | null;
  headline: string | null;
  fallback_title: string | null;
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
  field: SearchField;
  text: string;
}

/** One search term: the lowercased text to find, and whether it was a `file:` term. */
export interface SearchTerm {
  text: string;
  file: boolean;
}

/** The query's space-separated terms, up to `SEARCH_MAX_TERMS`. A bare `file:` is dropped. */
export function searchTerms(query: string): SearchTerm[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) =>
      t.startsWith(FILE_PREFIX)
        ? { text: t.slice(FILE_PREFIX.length), file: true }
        : { text: t, file: false },
    )
    .filter((t) => t.text !== "")
    .slice(0, SEARCH_MAX_TERMS);
}

/** A LIKE pattern matching `term` anywhere, with LIKE's wildcards and escape character escaped. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Search SQL for `terms` bound as ?1..?n (from `likePattern`). Only the number of terms, which of
 * them are `file:` terms, the internal `limit` and the visibility condition (`visibleSessionSql`)
 * shape the SQL; the search text is always a bound parameter.
 */
export function searchSql(terms: SearchTerm[], limit: number, visible: string): string {
  const cond = (t: SearchTerm, i: number) =>
    `(src.field ${t.file ? "=" : "!="} 'file' AND lower(src.text) LIKE ?${i + 1} ESCAPE '\\')`;
  const conds = terms.map((t, i) => `MAX(${cond(t, i)})`).join(" AND ");
  const first = terms[0] ? cond(terms[0], 0) : "0";
  const sources = SEARCH_SOURCES + (terms.some((t) => t.file) ? FILE_SOURCE : "");
  return `WITH src AS (${sources}),
         matched AS (
           SELECT src.sid, src.start FROM src
           JOIN sessions s ON s.id = src.sid AND ${visible}
           GROUP BY src.sid, src.start HAVING ${conds}
         ),
         best AS (
           SELECT src.sid, src.start, src.field, src.text,
                  ROW_NUMBER() OVER (PARTITION BY src.sid, src.start
                                     ORDER BY CASE src.field ${SEARCH_FIELD_RANK} END) AS n
           FROM src JOIN matched USING (sid, start)
           WHERE ${first}
         )
         SELECT b.sid, b.start, g.end, s.project_id, s.label, sm.headline, g.fallback_title,
                s.custom_title, s.agent_name, s.ai_title, s.first_prompt, b.field, b.text
         FROM best b
         JOIN segments g ON g.session_id = b.sid AND g.start = b.start
         JOIN sessions s ON s.id = b.sid
         LEFT JOIN summaries sm ON sm.session_id = b.sid AND sm.start = b.start
         WHERE b.n = 1
         ORDER BY b.start DESC
         LIMIT ${limit + 1}`;
}

/**
 * A search row as the API reports it, with a snippet around `firstTerm` unless the headline
 * matched. `headline` is the section's headline as the calendar shows it, which the caller derives
 * from the row's summary, block and session titles.
 */
export function toSearchHit(r: SearchRow, firstTerm: string, headline: string): SearchHit {
  return {
    sessionId: r.sid,
    projectId: r.project_id,
    label: r.label,
    start: r.start,
    end: r.end,
    headline,
    field: r.field,
    snippet: r.field === "headline" ? "" : excerpt(r.text, firstTerm),
  };
}

/** About SNIPPET_CHARS of `text` around the first occurrence of `term`, on one line. */
export function excerpt(text: string, term: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = Math.max(0, flat.toLowerCase().indexOf(term));
  const from = Math.max(0, at - Math.floor(SNIPPET_CHARS / 3));
  const to = Math.min(flat.length, from + SNIPPET_CHARS);
  return `${from > 0 ? "…" : ""}${flat.slice(from, to)}${to < flat.length ? "…" : ""}`;
}

/** Search results: the hits, and whether more sections matched than were returned. */
export interface SearchResult {
  hits: SearchHit[];
  more: boolean;
}

/**
 * Work blocks matching every space-separated term, across all periods, newest first, among
 * sessions matching `visible` (a `visibleSessionSql` condition on alias `s`).
 * Looks at what a person would remember a piece of work by: the summary, the session title and
 * branch, PR and commit titles, and the prompts and replies of the main conversation.
 * `file:<path>` terms match the paths of files edited in the block instead (and only them).
 * Each term may match a different place; the hit reports the most telling place the first term matched.
 * A plain LIKE scan: on a year of real logs this takes tens of milliseconds, so no FTS index is needed.
 */
export function searchBlocks(
  db: Database,
  query: string,
  visible: string,
  limit = SEARCH_LIMIT,
): SearchResult {
  const terms = searchTerms(query);
  if (terms.length === 0) return { hits: [], more: false };
  const rows = db
    .query<SearchRow, string[]>(searchSql(terms, limit, visible))
    .all(...terms.map((t) => likePattern(t.text)));
  const first = terms[0]?.text ?? "";
  return {
    hits: rows.slice(0, limit).map((r) => toSearchHit(r, first, sectionHeadline(r, title(r)))),
    more: rows.length > limit,
  };
}
