import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/** The project a session belongs to, resolved from its working directory. */
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
 * A directory's git remote (origin) as read from disk: its URL, null if there is no remote, or
 * undefined if the directory itself is gone and it cannot be told.
 */
export type RemoteReading = string | null | undefined;

/** Returns the reading of the directory's git remote (see `RemoteReading`). */
export type RemoteLookup = (dir: string) => RemoteReading;

/**
 * Whether a remote reading says the directory is gone from this machine (a container's checkout,
 * a deleted clone), so its remote can't be told, as opposed to a directory without a remote.
 */
export function isGoneDir(remote: RemoteReading): remote is undefined {
  return remote === undefined;
}

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

/** System temp directories (`/tmp`, `$TMPDIR` under `/var/folders`) and Claude Code's job directories. */
const TEMP_RE =
  /^(?:\/private)?\/(?:tmp|var\/folders)(?:\/|$)|\/\.claude\/jobs\/[^/]+\/tmp(?:\/|$)/;

/** Whether the directory is a temporary one, whose name says nothing about the work. */
export function isTemporary(cwd: string): boolean {
  return TEMP_RE.test(cwd);
}

/** The system temp directory itself, which every throwaway run shares. */
const TEMP_ROOT_RE = /^(?:\/private)?\/tmp$/;

/** Whether the path is the system temp directory itself rather than one made inside it. */
export function isTempRoot(path: string): boolean {
  return TEMP_ROOT_RE.test(path);
}

/**
 * A directory inside Claude Code's own configuration (`~/.claude`), such as a log folder. Only a
 * home directory's: a repository's `.claude` folder belongs to the repository.
 */
const CLAUDE_DIR_RE = /^(?:\/Users|\/home)\/[^/]+\/\.claude(?:\/|$)/;

/** Whether the directory belongs to Claude Code's configuration rather than to any work. */
export function isClaudeDir(path: string): boolean {
  return CLAUDE_DIR_RE.test(path);
}

/** A session's log folder: `~/.claude/projects/<launch dir, encoded>`. */
const LOG_DIR_RE = /\/\.claude\/projects\/(-[^/]+)/;

/** The encoded launch directory whose logs a log folder holds, or null for other paths. */
export function logDirOwner(path: string): string | null {
  return LOG_DIR_RE.exec(path)?.[1] ?? null;
}

/**
 * A Claude Code scratchpad: `<tmp>/claude-<uid>/<launch dir, encoded>/<session>/scratchpad/…`.
 * The encoded part names the directory of the session that made it.
 */
const SCRATCHPAD_RE = /^(?:\/private)?\/tmp\/claude-[^/]+\/(-[^/]+)\/[^/]+\/scratchpad(?:\/|$)/;

/** The encoded launch directory of the session that owns a scratchpad, or null for other paths. */
export function scratchpadOwner(cwd: string): string | null {
  return SCRATCHPAD_RE.exec(cwd)?.[1] ?? null;
}

/**
 * A directory as Claude Code names its log folder: every character other than a letter or digit
 * becomes `-`. Lossy (a `-` may have been `/` or `.`), so it is only compared, never decoded.
 */
export function encodeDir(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, "-");
}

/** A repository as a git remote or a PR URL names it. */
export interface RemoteKey {
  /** `host/owner/name`, the key projects group by. */
  key: string;
  /** The repository's own name. */
  name: string;
  /** `owner/name`, as GitHub writes it. */
  fullName: string;
}

/**
 * The repository (`host/owner/repo` key and name) of a PR URL such as
 * `https://github.com/owner/repo/pull/12`, in the same form `parseRemote` gives a git remote.
 */
export function repoOfPrUrl(url: string): RemoteKey | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const [owner, repo, kind] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !repo || kind !== "pull") return null;
  return parseRemote(`https://${parsed.hostname}/${owner}/${repo}`);
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
export function parseRemote(url: string): RemoteKey | null {
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
  return { key, name, fullName: path };
}

/** How many local clones `readGitRemote` follows to reach a remote (a clone of a clone of …). */
const MAX_LOCAL_HOPS = 3;

/**
 * Reads the origin URL from `<dir>/.git/config`. Does not run git (to stay read-only).
 * Also handles the `.git` file (`gitdir: …`) of worktrees and submodules. An origin that is
 * another clone on this machine is followed to that clone's origin, so a copy made from a local
 * clone joins the same repository; when it leads nowhere, the local path is returned.
 */
export function readGitRemote(dir: string): RemoteReading {
  return followLocalOrigin(dir, readOrigin(dir), 0);
}

/** `url`, the origin of `dir`, or the origin it leads to when it is a local clone. */
function followLocalOrigin(dir: string, url: RemoteReading, hops: number): RemoteReading {
  const local = url ? localPathOf(url, dir) : null;
  if (!local || hops >= MAX_LOCAL_HOPS) return url;
  return followLocalOrigin(local, readOrigin(local), hops + 1) || url;
}

/** The directory a local-path remote points to (absolute, relative or `file://`), or null. */
function localPathOf(url: string, dir: string): string | null {
  if (url.startsWith("file://")) return fileUrlPath(url);
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../"))
    return resolve(dir, url);
  return null;
}

/** The path of a `file://` URL, or null when it is malformed (a config may hold anything). */
function fileUrlPath(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
}

/** The origin URL in the directory's own git config (see `RemoteReading`). */
function readOrigin(dir: string): RemoteReading {
  if (!existsSync(dir)) return undefined;
  try {
    const dotGit = join(dir, ".git");
    // A bare repository (often what a local clone was made from) is its own git directory
    if (!existsSync(dotGit)) return isBareRepo(dir) ? configOrigin(dir) : null;
    let gitDir = dotGit;
    if (!statSync(dotGit).isDirectory()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readSmallFile(dotGit) ?? "");
      if (!m?.[1]) return null;
      gitDir = resolve(dir, m[1].trim());
      // A worktree's config lives in the common git directory
      const common = readSmallFile(join(gitDir, "commondir"));
      if (common) gitDir = resolve(gitDir, common.trim());
    }
    return configOrigin(gitDir);
  } catch {
    return null;
  }
}

/** Whether the directory is a bare git repository: its git files sit at its root. */
function isBareRepo(dir: string): boolean {
  return existsSync(join(dir, "HEAD")) && existsSync(join(dir, "objects"));
}

/** The origin URL in a git directory's config, or null when it has none. */
function configOrigin(gitDir: string): string | null {
  const config = readSmallFile(join(gitDir, "config"));
  return config === null ? null : originUrl(config);
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
