// Extracts the title of PRs created by Bash gh pr create calls.
// Neither pr-link records nor the result's gitOperation carry the title, so read it from the arguments.

/** Matches a `gh pr create` command anywhere in a Bash call. */
export const GH_PR_CREATE_RE = /\bgh\s+pr\s+create\b/;

/** A shell word. `dynamic` means it contains `$…` or `` `…` `` and its value is decided at run time. */
interface Word {
  text: string;
  dynamic: boolean;
}

/**
 * Value of `--title "…"` / `--title=…` / `-t '…'`. null if missing or decided at run time
 * (e.g. `$(…)`). Looks only after `gh pr create`, up to the next `&&`, `;`, `|` or newline.
 */
export function prTitleOf(command: string): string | null {
  const m = GH_PR_CREATE_RE.exec(command);
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

/** PR URL found in the output (for older logs without `gitOperation`). */
export function prUrlIn(output: string): string | null {
  return /https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/\d+/.exec(output)?.[0] ?? null;
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
