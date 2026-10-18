// What a stretch of work is about, read from what it touched: the issues and PRs it names, the
// worktree or branch it works in and the files it edits. Work blocks cut only on a pause run for
// hours across several topics, while a pause in one topic leaves a fragment too short to summarize;
// these signals split the first at a change of topic and join the second back to its neighbour.
import { HOUR, MINUTE } from "../../shared/dates.ts";
import { refsOf } from "../refs.ts";
import { isRequest } from "./activityKinds.ts";
import type { TopicActivityRow } from "./statements.ts";

/** Blocks at most this long are never split: a topic change inside one costs the digest little. */
export const SPLIT_LONGER_THAN_MS = HOUR;
/** A part split off is at least this long and has this many requests, so no part is a fragment. */
export const MIN_PART_MS = 15 * MINUTE;
/** See `MIN_PART_MS`. */
export const MIN_PART_REQUESTS = 2;
/** A block shorter than this is a fragment that may join a neighbour on the same topic. */
export const SHORT_BLOCK_MS = 10 * MINUTE;
/** The longest pause a fragment joins its neighbour across. */
export const JOIN_GAP_MS = 45 * MINUTE;

/** A PR the session opened (a `pr-link` record), placed at the moment it was opened. */
export interface PrMark {
  ts: number;
  /** The PR's URL. */
  ref: string;
}

/** What a row says its work is about. */
export interface Topic {
  /** Refs (`refsOf`: "#12", "APP-3"), worktrees ("wt:name") and branches ("br:name"). */
  keys: Set<string>;
  /** Files edited, by path, scratch files left out. */
  files: Set<string>;
}

/**
 * Tools whose stored input `topicActivity` loads to read the topic from. Edit tools are read from
 * their path instead, which survives the clipping of a long input.
 */
export const INPUT_TOPIC_TOOLS = ["Bash", "EnterWorktree"] as const;

/** Branches every topic passes through, which say nothing about the topic. */
const SHARED_BRANCHES = new Set(["main", "master", "develop", "development", "HEAD"]);

/** `.claude/worktrees/<name>` (Claude Code's own worktrees) anywhere in a path or command. */
const WORKTREE_RE = /\.claude\/worktrees\/([\w.-]+)/g;
/** A `gh issue|pr <verb> 12` call, which names the number without a `#`. */
const GH_REF_RE = /\bgh\s+(?:issue|pr)\s+[a-z-]+\s+(\d+)\b/g;
/**
 * A branch switched to or created: `git switch [-c] <b>` or `git checkout -b <b>`. A bare
 * `git checkout <x>` is left out, since x is as often a path being restored.
 */
const BRANCH_RE =
  /\bgit\s+(?:-C\s+\S+\s+)?(?:switch\s+(?:-[cC]\s+)?|checkout\s+-[bB]\s+)([\w./-]+)/g;
/** Files that are scratch rather than the work: temp dirs, scratchpads and Claude's own memory. */
const SCRATCH_RE = /^\/(?:tmp|private)\/|\/scratchpad\/|\/\.claude\/projects\//;

/** An empty topic. */
export function emptyTopic(): Topic {
  return { keys: new Set(), files: new Set() };
}

/** Adds everything `from` names to `into`. */
export function addTopic(into: Topic, from: Topic): Topic {
  for (const k of from.keys) into.keys.add(k);
  for (const f of from.files) into.files.add(f);
  return into;
}

/** Whether two topics share a key or an edited file. */
export function sharesTopic(a: Topic, b: Topic): boolean {
  for (const k of a.keys) if (b.keys.has(k)) return true;
  for (const f of a.files) if (b.files.has(f)) return true;
  return false;
}

/** The refs and worktrees named in free text: a prompt, a command or a path. */
function keysInText(text: string, into: Set<string>): void {
  for (const ref of refsOf(text)) into.add(ref);
  for (const m of text.matchAll(WORKTREE_RE)) into.add(`wt:${m[1]}`);
}

/** What a shell command names: refs, worktrees, `gh` calls by number, and branches switched to. */
function commandKeys(command: string, into: Set<string>): void {
  keysInText(command, into);
  for (const m of command.matchAll(GH_REF_RE)) into.add(`#${m[1]}`);
  for (const m of command.matchAll(BRANCH_RE)) {
    const name = m[1] ?? "";
    const remote = name.startsWith("origin/");
    if (!name.startsWith("-") && !remote && !SHARED_BRANCHES.has(name)) into.add(`br:${name}`);
  }
}

/** The worktree EnterWorktree enters: by name, or by path when it enters an existing one. */
function worktreeKeys(input: string, into: Set<string>): void {
  try {
    const { name } = JSON.parse(input) as { name?: unknown };
    if (typeof name === "string") into.add(`wt:${name}`);
  } catch {
    // A clipped input isn't JSON; its path, if any, is still read below
  }
  keysInText(input, into);
}

/**
 * What a tool call names. Bash's stored input is read as text rather than parsed, since a long
 * command is clipped mid-JSON and the refs in its body (a commit's `Closes #12`) matter most.
 */
function toolTopic(row: TopicActivityRow, topic: Topic): void {
  const input = row.input;
  if (!input) return;
  if (row.tool_name === "Bash") commandKeys(input, topic.keys);
  else if (row.tool_name === "EnterWorktree") worktreeKeys(input, topic.keys);
  else if (!SCRATCH_RE.test(input)) {
    topic.files.add(input);
    keysInText(input, topic.keys);
  }
}

/** What one activity row says its work is about. */
export function rowTopic(row: TopicActivityRow): Topic {
  const topic = emptyTopic();
  if (isRequest(row)) keysInText(row.text ?? "", topic.keys);
  else if (row.kind === "tool_use") toolTopic(row, topic);
  return topic;
}

/** A run of activity with what it is about. */
interface Stretch {
  rows: TopicActivityRow[];
  topic: Topic;
}

/** A stretch of the given rows, with their topic. */
function stretchOf(rows: TopicActivityRow[]): Stretch {
  const topic = emptyTopic();
  for (const row of rows) addTopic(topic, rowTopic(row));
  return { rows: [...rows], topic };
}

/** Appends `from` to `into`, rows and topic. */
function absorb(into: Stretch, from: Stretch): void {
  into.rows.push(...from.rows);
  addTopic(into.topic, from.topic);
}

/** The first and last activity time of a run of rows. */
function span(rows: TopicActivityRow[]): { start: number; end: number } {
  return { start: rows[0]?.ts ?? 0, end: rows.at(-1)?.ts ?? 0 };
}

/**
 * A block's activity in turns, each a request and the work that answered it. Activity before the
 * first request is the first turn's.
 */
function turns(rows: TopicActivityRow[]): Stretch[] {
  const out: TopicActivityRow[][] = [];
  for (const row of rows) {
    const last = out.at(-1);
    if (!last || (isRequest(row) && last.some(isRequest))) out.push([row]);
    else last.push(row);
  }
  return out.map(stretchOf);
}

/**
 * Adds each PR opened during the turns to the turn that opened it, so a later turn naming only the
 * PR's number stays on that turn's topic. PRs opened outside the turns' span belong to other blocks.
 */
function attachPrs(turns: Stretch[], prs: PrMark[]): void {
  const { start, end } = span(turns.flatMap((t) => t.rows));
  for (const pr of prs) {
    if (pr.ts < start || pr.ts > end) continue;
    const turn = turns.findLast((t) => (t.rows[0]?.ts ?? 0) <= pr.ts);
    if (turn) keysInText(pr.ref, turn.topic.keys);
  }
}

/** A run of activity in turns, with the PRs each turn opened. */
function topicTurns(rows: TopicActivityRow[], prs: PrMark[]): Stretch[] {
  const out = turns(rows);
  attachPrs(out, prs);
  return out;
}

/**
 * Whether a turn starts a new topic: it names something, and shares nothing with the part so far,
 * which named something too. A turn that names nothing (a question, "go on") stays in the part.
 */
function changesTopic(part: Topic, turn: Topic): boolean {
  return turn.keys.size > 0 && part.keys.size > 0 && !sharesTopic(part, turn);
}

/** Whether a part is too small to stand alone (see `MIN_PART_MS`). */
function isFragment(part: Stretch): boolean {
  const { start, end } = span(part.rows);
  return end - start < MIN_PART_MS || part.rows.filter(isRequest).length < MIN_PART_REQUESTS;
}

/** Folds each part too small to stand alone into the one before it (the first into the next). */
function foldFragments(parts: Stretch[]): Stretch[] {
  const out: Stretch[] = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last && (isFragment(part) || isFragment(last))) absorb(last, part);
    else out.push(part);
  }
  return out;
}

/**
 * A long block's activity split where the topic changes (see `changesTopic`), with no part shorter
 * than `MIN_PART_MS`. A block up to `SPLIT_LONGER_THAN_MS` stays whole.
 */
export function splitByTopic(rows: TopicActivityRow[], prs: PrMark[] = []): TopicActivityRow[][] {
  const { start, end } = span(rows);
  if (end - start <= SPLIT_LONGER_THAN_MS) return [rows];
  const parts: Stretch[] = [];
  for (const turn of topicTurns(rows, prs)) {
    const part = parts.at(-1);
    if (part && !changesTopic(part.topic, turn.topic)) absorb(part, turn);
    else parts.push(turn);
  }
  return foldFragments(parts).map((p) => p.rows);
}

/** A whole run of activity as one stretch, the PRs it opened included. */
function wholeStretch(rows: TopicActivityRow[], prs: PrMark[]): Stretch {
  const whole: Stretch = { rows: [], topic: emptyTopic() };
  for (const turn of topicTurns(rows, prs)) absorb(whole, turn);
  return whole;
}

/** Whether two neighbouring blocks join (see `joinFragments`). */
function joins(before: Stretch, after: Stretch): boolean {
  const a = span(before.rows);
  const b = span(after.rows);
  const short = a.end - a.start < SHORT_BLOCK_MS || b.end - b.start < SHORT_BLOCK_MS;
  return short && b.start - a.end <= JOIN_GAP_MS && sharesTopic(before.topic, after.topic);
}

/**
 * Joins a fragment shorter than `SHORT_BLOCK_MS` to the block before it when the pause between them
 * is at most `JOIN_GAP_MS` and both are about the same thing (`sharesTopic`), so a short return to
 * the work after a break is summarized with it rather than on its own. Blocks are in time order.
 */
export function joinFragments(
  blocks: TopicActivityRow[][],
  prs: PrMark[] = [],
): TopicActivityRow[][] {
  const out: Stretch[] = [];
  for (const rows of blocks) {
    const stretch = wholeStretch(rows, prs);
    const last = out.at(-1);
    if (last && joins(last, stretch)) absorb(last, stretch);
    else out.push(stretch);
  }
  return out.map((s) => s.rows);
}
