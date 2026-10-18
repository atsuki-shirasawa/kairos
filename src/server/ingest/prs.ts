// Extracts the title of PRs created by Bash gh pr create calls.
// Neither pr-link records nor the result's gitOperation carry the title, so read it from the arguments.

/**
 * The title a PR is stored with from its pr-link record alone ("#<number> <owner/name>"), until a
 * `gh pr create` title replaces it. Readers tell it from a real title with `isPrLinkTitle`.
 */
export function prLinkTitle(number: number | null, repository: string | null): string | null {
  return [number === null ? null : `#${number}`, repository].filter(Boolean).join(" ") || null;
}

/** Whether `title` is only the pr-link stand-in (`prLinkTitle`) for PR `number` of `repository`. */
export function isPrLinkTitle(title: string, number: number, repository: string): boolean {
  const standIns = [prLinkTitle(number, repository), prLinkTitle(null, repository)];
  return standIns.includes(title) || title === prLinkTitle(number, null);
}

/** Matches a `gh pr create` command anywhere in a Bash call. */
export const GH_PR_CREATE_RE = /\bgh\s+pr\s+create\b/;

/** A shell word. `dynamic` means it contains `$…` or `` `…` `` and its value is decided at run time. */
interface Word {
  text: string;
  dynamic: boolean;
}

/**
 * Value of `--title "…"` / `--title=…` / `-t '…'` of `gh pr create`. null if missing or decided at
 * run time (e.g. `$(…)`). Looks only after `gh pr create`, up to the next `&&`, `;`, `|` or newline.
 */
export function prTitleOf(command: string): string | null {
  return titleAfter(command, GH_PR_CREATE_RE);
}

/**
 * Value of the `--title` / `-t` option of the command `commandRe` finds (`gh pr create`,
 * `gh issue create`), read with shell rules. null if missing or decided at run time.
 */
export function titleAfter(command: string, commandRe: RegExp): string | null {
  const m = commandRe.exec(command);
  if (!m) return null;
  const words = shellWords(command.slice(m.index + m[0].length));
  for (const [i, w] of words.entries()) {
    let value: Word | undefined;
    if (w.text === "--title" || w.text === "-t") value = words[i + 1];
    else if (w.text.startsWith("--title=")) value = { ...w, text: w.text.slice(8) };
    else continue;
    if (!value || value.dynamic) return null;
    return value.text.trim() || null;
  }
  return null;
}

/**
 * Splits one command's arguments into words using shell rules (quotes, backslashes).
 * Stops at a control operator (`&&`, `||`, `;`, `|`, newline).
 */
function shellWords(input: string): Word[] {
  const words: Word[] = [];
  let text = "";
  let dynamic = false;
  let inWord = false;
  const end = () => {
    if (inWord) words.push({ text, dynamic });
    text = "";
    dynamic = false;
    inWord = false;
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i] ?? "";
    if (c === "'") {
      const close = input.indexOf("'", i + 1);
      if (close === -1) return words; // An unclosed quote cannot be read, so stop there
      text += input.slice(i + 1, close);
      inWord = true;
      i = close;
    } else if (c === '"') {
      inWord = true;
      for (i++; i < input.length && input[i] !== '"'; i++) {
        const d = input[i] ?? "";
        if (d === "\\" && i + 1 < input.length && '"\\$`\n'.includes(input[i + 1] ?? "")) {
          text += input[++i];
        } else {
          if (d === "$" || d === "`") dynamic = true;
          text += d;
        }
      }
      if (i >= input.length) return words;
    } else if (c === "\\") {
      // A backslash at the end of a line continues it
      if (input[i + 1] !== "\n") text += input[i + 1] ?? "";
      inWord = inWord || input[i + 1] !== "\n";
      i++;
    } else if (c === " " || c === "\t") {
      end();
    } else if (c === "\n" || c === ";" || c === "|" || c === "&") {
      break;
    } else {
      if (c === "$" || c === "`") dynamic = true;
      text += c;
      inWord = true;
    }
  }
  end();
  return words;
}

/** Every PR URL in a text (global: use with `matchAll` or `replace`). */
export const PR_URL_RE = /https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/\d+/g;

/** PR URL found in the output (for older logs without `gitOperation`). */
export function prUrlIn(output: string): string | null {
  return new RegExp(PR_URL_RE.source).exec(output)?.[0] ?? null;
}

/**
 * The ref a merge artifact is stored under: "#N", or the call's id when the merge names no PR
 * (it merged the current branch's), so two such merges stay apart. Read back by `mergedPrNumber`.
 */
export function mergeRef(number: number | null, toolUseId: string): string {
  return number !== null ? `#${number}` : `call:${toolUseId}`;
}

/** The PR number a merge artifact's ref names, or null when the merge named none. */
export function mergedPrNumber(ref: string): number | null {
  const n = /^#(\d+)$/.exec(ref)?.[1];
  return n === undefined ? null : Number(n);
}

/**
 * `gh pr merge` where a command starts (the start of the call, or after `&&`, `||`, `;`, `|` or a
 * newline, past any `VAR=value` prefixes). Mentions inside other commands' arguments, such as
 * `grep "gh pr merge"` or a settings file listing `Bash(gh pr merge *)`, are not merges.
 */
const GH_PR_MERGE_RE = /(?:^|[\n;&|])[ \t]*(?:\w+=\S*[ \t]+)*gh[ \t]+pr[ \t]+merge\b([^\n;&|]*)/;

/**
 * A `gh pr merge` call: the PR number, or null when it merges the current branch's PR (or names it
 * by branch). undefined when the command doesn't merge. Newer logs also report the merge in
 * `toolUseResult.gitOperation.pr` (number only, no URL), but most real merges don't have it.
 */
export function prMergeOf(command: string): { number: number | null } | undefined {
  const m = GH_PR_MERGE_RE.exec(command);
  if (!m) return undefined;
  const words = shellWords(m[1] ?? "");
  for (let i = 0; i < words.length; i++) {
    const w = words[i]?.text ?? "";
    if (MERGE_VALUE_FLAGS.has(w)) i++;
    if (w.startsWith("-")) continue;
    const n = /^(?:https:\/\/\S+\/pull\/)?(\d+)$/.exec(w)?.[1];
    return { number: n ? Number(n) : null };
  }
  return { number: null };
}

/**
 * A `gh pr <verb>` call where a command starts, as `GH_PR_MERGE_RE` finds a merge: `-R` / `--repo`
 * given before `pr` in group 1, the verb in group 2 and its arguments in group 3.
 */
const GH_PR_CALL_RE =
  /(?:^|[\n;&|(])[ \t]*(?:\w+=\S*[ \t]+)*gh((?:[ \t]+(?:-R|--repo)(?:[ \t]+|=)\S+)*)[ \t]+pr[ \t]+([a-z-]+)\b([^\n;&|]*)/g;

/** A PR a `gh pr` call names by number, and the `owner/name` it gives with `-R` / `--repo`, if any. */
export interface PrCall {
  number: number;
  repo: string | null;
}

/**
 * The PRs the `gh pr <verb> <number>` calls of a command name, wherever the number stands among
 * the options. A call naming the PR by URL or branch, or none (`create`, `list`), gives nothing.
 */
export function prCallsIn(command: string): PrCall[] {
  return [...command.matchAll(GH_PR_CALL_RE)].flatMap((m) => {
    if (NO_PR_VERBS.has(m[2] ?? "")) return [];
    const call = prCallOf(shellWords(`${m[1] ?? ""} ${m[3] ?? ""}`));
    return call ? [call] : [];
  });
}

/** `gh pr` verbs that take no PR, whose numbers are option values (`list --limit 60`). */
const NO_PR_VERBS = new Set(["list", "create", "status"]);

/** `gh pr` options that take no value, so a number after one is the PR. */
const PR_SWITCHES = new Set([
  "--comments",
  "--watch",
  "--web",
  "-w",
  "--squash",
  "--merge",
  "--rebase",
  "--delete-branch",
  "-d",
  "--auto",
  "--admin",
  "--required",
  "--fail-fast",
]);

/**
 * The PR number and repository among one `gh pr` call's words: the first bare number that isn't
 * an option's value. An option outside `PR_SWITCHES` is taken to take the word after it.
 */
function prCallOf(words: Word[]): PrCall | null {
  let repo: string | null = null;
  let number: number | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]?.text ?? "";
    if (w === "-R" || w === "--repo") repo = words[++i]?.text ?? null;
    else if (w.startsWith("--repo=")) repo = w.slice("--repo=".length);
    else if (w.startsWith("-") && !w.includes("=") && !PR_SWITCHES.has(w)) i++;
    else if (number === null && /^\d+$/.test(w)) number = Number(w);
  }
  return number === null ? null : { number, repo };
}

/** `gh pr merge` options that take the next word as their value (so it isn't the PR). */
const MERGE_VALUE_FLAGS = new Set([
  "-b",
  "--body",
  "-F",
  "--body-file",
  "-t",
  "--subject",
  "-A",
  "--author-email",
  "-R",
  "--repo",
  "--match-head-commit",
]);
