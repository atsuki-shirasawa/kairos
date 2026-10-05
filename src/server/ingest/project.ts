import { basename } from "node:path";

export interface ProjectRef {
  /** プロジェクトを表すパス（worktree なら親リポジトリ）。 */
  path: string;
  name: string;
  /** worktree 名など、プロジェクト内での補助ラベル。 */
  label: string | null;
}

const WORKTREE_RE = /^(.+?)\/\.claude\/worktrees\/([^/]+)/;

/** 起動時の cwd からプロジェクトを決める。`<repo>/.claude/worktrees/<name>` は `<repo>` にまとめる。 */
export function resolveProject(cwd: string): ProjectRef {
  const m = WORKTREE_RE.exec(cwd);
  const path = m?.[1] ?? cwd.replace(/\/+$/, "");
  return { path, name: basename(path) || path, label: m?.[2] ?? null };
}

/** worktree のパスなら、その名前。 */
export function worktreeName(path: string): string | null {
  return WORKTREE_RE.exec(path)?.[2] ?? null;
}
