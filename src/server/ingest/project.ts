import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export interface ProjectRef {
  /** プロジェクトを表すパス（worktree なら親リポジトリ）。 */
  path: string;
  name: string;
  /** worktree 名など、プロジェクト内での補助ラベル。 */
  label: string | null;
  /** git の remote から取った鍵（`github.com/owner/repo`）。同じ鍵のディレクトリは 1 つにまとめる。 */
  repo: string | null;
}

/**
 * ディレクトリの git remote（origin）の URL を返す。remote がなければ null、
 * ディレクトリ自体がなくて判断できなければ undefined。
 */
export type RemoteLookup = (dir: string) => string | null | undefined;

const WORKTREE_RE = /^(.+?)\/\.claude\/worktrees\/([^/]+)/;

/**
 * 起動時の cwd からプロジェクトを決める。`<repo>/.claude/worktrees/<name>` は `<repo>` にまとめる。
 * git の remote があれば、名前はリポジトリ名にし、同じリポジトリの別のクローンとも同じプロジェクトにする。
 * ディレクトリ名がリポジトリ名と違うときは、どのクローンでの作業か分かるよう補助ラベルに残す。
 */
export function resolveProject(cwd: string, lookup: RemoteLookup = readGitRemote): ProjectRef {
  const path = projectDir(cwd);
  const dirName = basename(path) || path;
  const worktree = worktreeName(cwd);
  const url = lookup(path);
  const remote = url ? parseRemote(url) : null;
  if (!remote) return { path, name: dirName, label: worktree, repo: null };
  return {
    path,
    name: remote.name,
    label: worktree ?? (dirName !== remote.name ? dirName : null),
    repo: remote.key,
  };
}

/** プロジェクトを表すディレクトリ。worktree なら親リポジトリ。 */
export function projectDir(cwd: string): string {
  return WORKTREE_RE.exec(cwd)?.[1] ?? cwd.replace(/\/+$/, "");
}

/** worktree のパスなら、その名前。 */
export function worktreeName(path: string): string | null {
  return WORKTREE_RE.exec(path)?.[2] ?? null;
}

/**
 * remote の URL から、まとめるための鍵（`host/owner/repo`）とリポジトリ名を取り出す。
 * URL に含まれうる認証情報は鍵に入れない（DB に残さないため）。
 */
export function parseRemote(url: string): { key: string; name: string } | null {
  const u = url.trim();
  let host: string;
  let path: string;
  // scp 形式（git@github.com:owner/repo.git）。`https://` などの URL とは区別する
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(u);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    host = scp[1] ?? "";
    path = scp[2] ?? "";
  } else {
    try {
      const parsed = new URL(u);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      return null;
    }
  }
  path = path
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/, "");
  const name = path.split("/").at(-1);
  // ローカルパスの remote（file:// など）は host がなく、別の場所との同一視に使えない
  if (!host || !name) return null;
  const key = `${host.toLowerCase()}/${path}`;
  // 形の分からない URL（認証情報やクエリが紛れ込みうるもの）はまとめず、ディレクトリ名に戻す
  if (/[@?#:\s%]/.test(key)) return null;
  return { key, name };
}

/**
 * `<dir>/.git/config` から origin の URL を読む。git コマンドは実行しない（読むだけにとどめるため）。
 * worktree・サブモジュールの `.git` ファイル（`gitdir: …`）にも対応する。
 */
export function readGitRemote(dir: string): string | null | undefined {
  if (!existsSync(dir)) return undefined;
  try {
    const dotGit = join(dir, ".git");
    if (!existsSync(dotGit)) return null;
    let gitDir = dotGit;
    if (!statSync(dotGit).isDirectory()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readSmallFile(dotGit) ?? "");
      if (!m?.[1]) return null;
      gitDir = resolve(dir, m[1].trim());
      // worktree の config は共通の git ディレクトリにある
      const common = readSmallFile(join(gitDir, "commondir"));
      if (common) gitDir = resolve(gitDir, common.trim());
    }
    const config = readSmallFile(join(gitDir, "config"));
    return config === null ? null : originUrl(config);
  } catch {
    return null;
  }
}

/** git の設定ファイルとして読める大きさまで。これを超えるものや FIFO・デバイスは読まない。 */
const MAX_GIT_FILE = 64 * 1024;

/**
 * 普通の小さなファイルだけを読む。取り込みは同期で動くので、FIFO や `/dev/zero` へのリンク、
 * 巨大なファイルを読みにいくとサーバー全体が止まるため。
 */
function readSmallFile(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_GIT_FILE) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function originUrl(config: string): string | null {
  let inOrigin = false;
  for (const line of config.split("\n")) {
    const t = line.trim();
    if (t.startsWith("[")) {
      inOrigin = /^\[remote\s+"origin"\]$/.test(t);
      continue;
    }
    const m = inOrigin ? /^url\s*=\s*(.+)$/.exec(t) : null;
    if (m?.[1]) return m[1].trim();
  }
  return null;
}
