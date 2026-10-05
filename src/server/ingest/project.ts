import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export interface ProjectRef {
  /** Path that identifies the project (the parent repository for a worktree). */
  path: string;
  name: string;
  /** Secondary label within the project, such as the worktree name. */
  label: string | null;
  /** Key taken from the git remote (`github.com/owner/repo`). Directories with the same key are merged. */
  repo: string | null;
}

/**
 * Returns the URL of the directory's git remote (origin): null if there is no remote,
 * undefined if the directory itself is gone and it cannot be told.
 */
export type RemoteLookup = (dir: string) => string | null | undefined;

const WORKTREE_RE = /^(.+?)\/\.claude\/worktrees\/([^/]+)/;

/**
 * Determines the project from the startup cwd. `<repo>/.claude/worktrees/<name>` is grouped under `<repo>`.
 * With a git remote, the name is the repository name, and other clones of the same repository share the project.
 * When the directory name differs from the repository name, it is kept as a secondary label to tell clones apart.
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

/** Directory that identifies the project; the parent repository for a worktree. */
export function projectDir(cwd: string): string {
  return WORKTREE_RE.exec(cwd)?.[1] ?? cwd.replace(/\/+$/, "");
}

/** The worktree name, if the path is a worktree. */
export function worktreeName(path: string): string | null {
  return WORKTREE_RE.exec(path)?.[2] ?? null;
}

/**
 * Extracts the grouping key (`host/owner/repo`) and repository name from a remote URL.
 * Credentials that may be in the URL are kept out of the key (so they never reach the DB).
 */
export function parseRemote(url: string): { key: string; name: string } | null {
  const u = url.trim();
  let host: string;
  let path: string;
  // scp-style (git@github.com:owner/repo.git), as opposed to URLs like `https://`
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
  // Local-path remotes (file:// etc.) have no host and cannot identify the same repo elsewhere
  if (!host || !name) return null;
  const key = `${host.toLowerCase()}/${path}`;
  // URLs of unknown shape (which may carry credentials or queries) are not grouped; fall back to the directory name
  if (/[@?#:\s%]/.test(key)) return null;
  return { key, name };
}

/**
 * Reads the origin URL from `<dir>/.git/config`. Does not run git (to stay read-only).
 * Also handles the `.git` file (`gitdir: …`) of worktrees and submodules.
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
      // A worktree's config lives in the common git directory
      const common = readSmallFile(join(gitDir, "commondir"));
      if (common) gitDir = resolve(gitDir, common.trim());
    }
    const config = readSmallFile(join(gitDir, "config"));
    return config === null ? null : originUrl(config);
  } catch {
    return null;
  }
}

/**
 * Size limit for files we read. Repositories with many branches have configs over 100KB, so leave room,
 * while keeping it small enough to read synchronously in an instant. FIFOs and devices are never read.
 */
export const MAX_GIT_FILE = 4 * 1024 * 1024;

/**
 * Reads only small regular files. Ingest runs synchronously, so reading a FIFO, a link to `/dev/zero`,
 * or a huge file would stall the whole server.
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
