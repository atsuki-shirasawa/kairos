// Extracts the SHA and subject of commits created by Bash git commit calls.

export const GIT_COMMIT_RE = /\bgit\s+(?:-[Cc]\s+\S+\s+)*commit\b/;
/** Normal output: `[main 1a2b3c4] feat: add login form` (the first commit includes `(root-commit)`) */
const BRACKET_RE = /^\[[^\]\n]+? (?:\(root-commit\) )?([0-9a-f]{7,40})\] (.+)$/m;
/** A `git log --oneline` line: `1a2b3c4 feat: add login form` */
const ONELINE_RE = /^([0-9a-f]{7,40}) (.+)$/gm;

export interface Commit {
  sha: string | null;
  subject: string | null;
}

/**
 * null if the commit cannot be identified. `--amend` rewrites an existing commit, so it is not counted.
 * Real logs often run `git commit -q` (no output) and then check with `git log --oneline`, so
 * the subject comes from the command's `-m` or heredoc, and the SHA from a oneline row in the output.
 */
export function extractCommit(command: string, output: string): Commit | null {
  if (!GIT_COMMIT_RE.test(command) || /\s--amend\b/.test(command)) return null;

  const bracket = BRACKET_RE.exec(output);
  if (bracket?.[1]) return { sha: bracket[1], subject: bracket[2]?.trim() ?? null };

  const subject = messageOf(command);
  const lines = [...output.matchAll(ONELINE_RE)].map((m) => ({
    sha: m[1] ?? "",
    subject: (m[2] ?? "").trim(),
  }));
  if (subject) {
    const hit = lines.find((l) => l.subject === subject);
    return { sha: hit?.sha ?? null, subject };
  }
  // If the subject is unknown (e.g. passed from a file with -F), use the top git log row if one follows
  if (/\bgit\b[^|;&]*\blog\b/.test(command) && lines[0]) return lines[0];
  return null;
}

/** First line of `-m "…"` / `-m '…'` / `-m "$(cat <<'EOF' … EOF)"`. */
function messageOf(command: string): string | null {
  const heredoc = /-m\s+"\$\(cat\s+<<-?\s*'?(\w+)'?\s*\n([\s\S]*?)\n\s*\1\b/.exec(command);
  if (heredoc?.[2]) return firstLine(heredoc[2]);
  const quoted = /(?:^|\s)-(?:[a-zA-Z]*m)\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(command);
  const msg = quoted?.[1] ?? quoted?.[2];
  return msg ? firstLine(msg.replace(/\\"/g, '"')) : null;
}

function firstLine(text: string): string | null {
  return (
    text
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? null
  );
}
