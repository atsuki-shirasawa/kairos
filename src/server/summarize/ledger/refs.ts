// The refs that tie open items to the log: issue / PR numbers, Jira keys and task IDs a text
// names. Pure, so the section store, the ledger and the tests can all read them.
import type { TaskState } from "../../tasks.ts";

/**
 * Words shaped like Jira keys that aren't (encodings, standards, hashes). A false key only makes
 * an item a candidate for one more section, so the list need not be complete.
 */
const NOT_JIRA = new Set(["UTF", "ISO", "SHA", "RFC", "MD", "ES", "TLS", "HTTP", "CVE", "GPT"]);

const TASK_REF_RE = /(?:\btask|タスク)\s*#?(\d+)\b/gi;
const NUMBER_REF_RE = /(?<![\w&#/])#(\d+)\b/g;
const URL_REF_RE = /\/(?:pull|issues)\/(\d+)\b/g;
const JIRA_REF_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g;

/** Prefix of a task ref ("task:3"). Task IDs only mean something within one session chain. */
export const TASK_REF_PREFIX = "task:";

/** Whether a ref names a task rather than an issue, PR or Jira key. */
export const isTaskRef = (ref: string): boolean => ref.startsWith(TASK_REF_PREFIX);

/** Whether the log can show a ref settled: issue / PR numbers and task IDs. */
export const isClosable = (ref: string): boolean => ref.startsWith("#") || isTaskRef(ref);

/**
 * The issue / PR numbers ("#12"), Jira keys ("APP-31") and task IDs ("task:3") a text names. On
 * GitHub, issues and PRs share one number space per repository, so both are "#N". A task named
 * as "task #3" is only a task, not issue #3 too.
 */
export function refsOf(text: string): string[] {
  const refs = new Set<string>();
  for (const [, id] of text.matchAll(TASK_REF_RE)) refs.add(`${TASK_REF_PREFIX}${id}`);
  const rest = text.replace(TASK_REF_RE, " ");
  for (const [, num] of rest.matchAll(NUMBER_REF_RE)) refs.add(`#${num}`);
  for (const [, num] of rest.matchAll(URL_REF_RE)) refs.add(`#${num}`);
  for (const [key, project] of rest.matchAll(JIRA_REF_RE))
    if (!NOT_JIRA.has(project ?? "")) refs.add(key);
  return [...refs];
}

/** An item's refs plus the tasks whose subject it quotes, since items often name a task by subject. */
export function itemRefs(text: string, tasks: TaskState[]): string[] {
  const lower = text.toLowerCase();
  const bySubject = tasks
    .filter((t) => t.subject.length >= 8 && lower.includes(t.subject.toLowerCase()))
    .map((t) => `${TASK_REF_PREFIX}${t.id}`);
  return [...new Set([...refsOf(text), ...bySubject])];
}
