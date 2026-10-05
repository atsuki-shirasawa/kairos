// Bash の git commit 呼び出しから、作られたコミットの SHA と件名を取り出す。

export const GIT_COMMIT_RE = /\bgit\s+(?:-[Cc]\s+\S+\s+)*commit\b/;
/** 通常の出力: `[main 1a2b3c4] feat: add login form`（初回は `(root-commit)` が入る） */
const BRACKET_RE = /^\[[^\]\n]+? (?:\(root-commit\) )?([0-9a-f]{7,40})\] (.+)$/m;
/** `git log --oneline` の行: `1a2b3c4 feat: add login form` */
const ONELINE_RE = /^([0-9a-f]{7,40}) (.+)$/gm;

export interface Commit {
  sha: string | null;
  subject: string | null;
}

/**
 * コミットを特定できなければ null。`--amend` は既存のコミットの書き換えなので数えない。
 * 実ログでは `git commit -q`（出力なし）の後に `git log --oneline` で確かめる使い方が多いため、
 * 件名はコマンドの `-m` やヒアドキュメントから取り、SHA は出力の oneline 行から探す。
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
  // -F でファイルから渡したときなど件名が分からない場合は、続けて git log を見ていればその先頭
  if (/\bgit\b[^|;&]*\blog\b/.test(command) && lines[0]) return lines[0];
  return null;
}

/** `-m "…"` / `-m '…'` / `-m "$(cat <<'EOF' … EOF)"` の 1 行目。 */
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
