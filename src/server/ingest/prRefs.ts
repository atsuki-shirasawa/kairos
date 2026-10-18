// Which issues and PRs each work block touched, so a PR's work can be found across sessions. A
// number with no repository of its own (#12, gh pr view 12, a merge) is the session's project's;
// a PR URL names its own. What the logs say of a PR (its title, when it was opened and merged)
// rides on the refs of the blocks that opened and merged it, so it is read from visible ones only.
import type { PrRef, PrTouch } from "../../shared/api.ts";
import { prOfUrl } from "../prUrls.ts";
import { refsOf } from "../refs.ts";
import { isRequest } from "./activityKinds.ts";
import { isPrLinkTitle, mergedPrNumber, PR_URL_RE, prCallsIn } from "./prs.ts";
import type { ActivityRow } from "./statements.ts";

/** A number a block touched, and how. A type alias, so it binds by name to bun:sqlite. */
export type BlockRef = PrRef & {
  blockId: number;
  how: PrTouch;
  /** When the block opened or merged the PR; null for work on it or a mention. */
  ts: number | null;
  /** The title the block opened the PR with; null when unknown or for any other touch. */
  title: string | null;
};

/** A PR or merge artifact, with the block whose outputs it is (see `blockOutputsUntilSql`). */
export interface BlockOutput {
  blockId: number;
  kind: string;
  /** A PR's URL, or a merge's ref (see `mergeRef`). */
  ref: string;
  title: string | null;
  ts: number;
}

/** A stored block's id and span. */
export interface BlockSpan {
  id: number;
  start: number;
  end: number;
}

/** A number named in a text, and how. */
type NamedRef = PrRef & { how: PrTouch };

/**
 * Issue and PR URLs, with or without a scheme. They name their own repository, so they are taken
 * out before bare numbers are read: `refsOf` would read them as this repository's #N.
 */
const REF_URL_RE = /\S*\/(?:pull|issues)\/\d+\S*/g;

/** The command of a Bash call's stored input, which is JSON unless clipping cut it short. */
function commandOf(input: string): string {
  try {
    const { command } = JSON.parse(input) as { command?: unknown };
    return typeof command === "string" ? command : input;
  } catch {
    return input;
  }
}

/** The repository key for an `owner/name` a command gives, on the session repository's host. */
function repoKeyOf(fullName: string, sessionRepo: string | null): string {
  const host = sessionRepo?.split("/")[0] ?? "github.com";
  return `${host}/${fullName}`;
}

/** The PRs a text works on through their URLs. */
function urlRefs(text: string): NamedRef[] {
  return [...text.matchAll(PR_URL_RE)].flatMap(([url]) => {
    const pr = prOfUrl(url);
    return pr ? [{ repo: pr.repo, number: pr.number, how: "worked" as const }] : [];
  });
}

/** The numbers bare `#N` in a text mentions, URLs left out (see `REF_URL_RE`). */
function mentions(text: string, repo: string): NamedRef[] {
  return refsOf(text.replace(REF_URL_RE, " "))
    .filter((ref) => ref.startsWith("#"))
    .map((ref) => ({ repo, number: Number(ref.slice(1)), how: "mentioned" as const }));
}

/** The numbers a request names: PR URLs it works on, and #N it mentions. */
export function requestRefs(text: string, repo: string | null): NamedRef[] {
  return [...urlRefs(text), ...(repo ? mentions(text, repo) : [])];
}

/**
 * The numbers a Bash command names: PR URLs and `gh pr` calls work on the PR (a call's `--repo`
 * names its repository), and #N mentions it.
 */
export function commandRefs(command: string, repo: string | null): NamedRef[] {
  const calls = prCallsIn(command).flatMap((call) => {
    const key = call.repo ? repoKeyOf(call.repo, repo) : repo;
    return key ? [{ repo: key, number: call.number, how: "worked" as const }] : [];
  });
  return [...urlRefs(command), ...calls, ...(repo ? mentions(command, repo) : [])];
}

/** The numbers one activity row names. */
function rowRefs(row: ActivityRow, repo: string | null): NamedRef[] {
  if (isRequest(row)) return requestRefs(row.text ?? "", repo);
  if (row.kind === "tool_use" && row.tool_name === "Bash" && row.input) {
    return commandRefs(commandOf(row.input), repo);
  }
  return [];
}

/** What a PR or merge artifact says of the block it belongs to. */
function outputRef(o: BlockOutput, repo: string | null): BlockRef | null {
  if (o.kind === "pr") {
    const pr = prOfUrl(o.ref);
    if (!pr) return null;
    const title = o.title && !isPrLinkTitle(o.title, pr.number, pr.fullName) ? o.title : null;
    return { blockId: o.blockId, repo: pr.repo, number: pr.number, how: "opened", ts: o.ts, title };
  }
  const number = mergedPrNumber(o.ref);
  if (o.kind !== "merge" || !repo || number === null) return null;
  return { blockId: o.blockId, repo, number, how: "merged", ts: o.ts, title: null };
}

/**
 * The refs the activity names, each on the block it falls in. Both lists are in time order, so one
 * pass walks them together.
 */
function namedRefs(blocks: BlockSpan[], activity: ActivityRow[], repo: string | null): BlockRef[] {
  const out: BlockRef[] = [];
  let b = 0;
  for (const row of activity) {
    while (b < blocks.length && (blocks[b]?.end ?? 0) < row.ts) b++;
    const block = blocks[b];
    if (!block || row.ts < block.start) continue;
    for (const r of rowRefs(row, repo))
      out.push({ ...r, blockId: block.id, ts: null, title: null });
  }
  return out;
}

/** The key that makes a block ref distinct. */
const refKey = (r: BlockRef) => `${r.blockId} ${r.repo} ${r.number} ${r.how}`;

/**
 * Every number each block touched: those its requests and Bash calls work on or mention, and the
 * PRs it opened or merged (its outputs), the earliest of each kept. `blocks` and `activity` are in
 * time order; `repo` is the session's repository, null when unknown (then only URLs and `--repo`
 * say which).
 */
export function blockRefs(
  blocks: BlockSpan[],
  activity: ActivityRow[],
  outputs: BlockOutput[],
  repo: string | null,
): BlockRef[] {
  const made = [...outputs].sort((a, b) => a.ts - b.ts).flatMap((o) => outputRef(o, repo) ?? []);
  const refs = new Map<string, BlockRef>();
  for (const r of [...namedRefs(blocks, activity, repo), ...made]) {
    if (!refs.has(refKey(r))) refs.set(refKey(r), r);
  }
  return [...refs.values()];
}
