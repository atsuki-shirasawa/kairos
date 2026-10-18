// Which project each session belongs to, decided from its startup cwd. The rules run when a
// session's launch is first seen, again when a PR names a repository, and over every session when
// DERIVED_VERSION changes.
import { basename } from "node:path";
import {
  encodeDir,
  isClaudeDir,
  isGoneDir,
  isTemporary,
  isTempRoot,
  logDirOwner,
  type ProjectRef,
  projectDir,
  type RemoteLookup,
  type RemoteReading,
  repoOfPrUrl,
  resolveProject,
  scratchpadOwner,
} from "./project.ts";
import type { SessionInfoRow, SessionRepoRow, Statements } from "./statements.ts";

/**
 * Where a session belongs: its project row, or null for none (a directory that is never a
 * project), and the secondary label shown beside the name.
 */
export interface Place {
  id: number | null;
  label: string | null;
}

/**
 * The project of each launch directory, keyed by the name Claude Code encodes it to (see
 * `encodeDir`), as `ProjectPlacer.launchDirProjects` reads it for placing scratchpads.
 */
export type LaunchDirProjects = Map<string, number>;

/** A launch directory as the rules see it: its git remote reading and the project it resolves to. */
interface DirReading {
  cwd: string;
  remote: RemoteReading;
  own: ProjectRef;
}

/** The other projects the rules compare a directory against, read once per placement run. */
interface PlacementContext {
  /** From `launchDirProjects`, for scratchpads and log folders. */
  dirs: LaunchDirProjects;
  /** The launch directories of projects with a repository (every clone), for folders holding them. */
  repoPaths: readonly string[];
}

/**
 * Places sessions in projects and keeps the project rows: creates them, merges rows of the same
 * repository, and deletes rows left without sessions.
 */
export class ProjectPlacer {
  constructor(
    private readonly q: Statements,
    /** How to read the git remote. Tests replace it with one that does not touch real directories. */
    private readonly lookupRemote: RemoteLookup,
  ) {}

  /** The git remote of the project directory `cwd` belongs to, as `lookupRemote` reads it. */
  remoteOf(cwd: string): RemoteReading {
    return this.lookupRemote(projectDir(cwd));
  }

  /** Where a session launched in `cwd` belongs, when its launch is first recorded. */
  placeLaunch(cwd: string): Place {
    return this.placeOf(this.read(cwd, this.remoteOf(cwd)), this.context());
  }

  /** A launch directory with its git remote reading and the project it resolves to on its own. */
  private read(cwd: string, remote: RemoteReading): DirReading {
    return { cwd, remote, own: resolveProject(cwd, () => remote) };
  }

  /** What the rules compare a directory against, read once per placement run. */
  private context(): PlacementContext {
    const repoPaths = (this.q.repoLaunchDirs.all() as { cwd: string }[]).map((r) => r.cwd);
    return { dirs: this.launchDirProjects(), repoPaths };
  }

  /**
   * Where sessions launched in a directory belong: the project row and secondary label. The git
   * remote wins, then the rules of `byRule`, and otherwise the directory is its own project.
   */
  private placeOf(dir: DirReading, ctx: PlacementContext): Place {
    return this.byRemote(dir.own) ?? this.byRule(dir, ctx) ?? this.placeByDir(dir.own);
  }

  /**
   * Placement of a directory without a git remote by the rules that don't read it, or null when
   * none applies. The first that places it wins, in order: the repository of its PRs, the
   * scratchpad's owner, a temporary directory, Claude Code's configuration, and a directory
   * holding repositories.
   */
  private byRule(dir: DirReading, ctx: PlacementContext): Place | null {
    const temp = isTemporary(dir.cwd);
    return (
      this.byPrRepo(dir, temp) ??
      byScratchpadOwner(dir.cwd, ctx.dirs) ??
      byTemporaryDir(dir.cwd, temp) ??
      byClaudeDir(dir.own.path, ctx.dirs) ??
      byHeldRepos(dir.own, ctx.repoPaths)
    );
  }

  /** Placement by the directory's git remote, or null when it has none. */
  private byRemote(own: ProjectRef): Place | null {
    return own.repo ? this.placeByDir(own) : null;
  }

  /**
   * Placement for a directory gone from this machine (a container's checkout) or a temporary one
   * (`temp`): the repository of the PRs opened from it, when they all point to one. Null otherwise.
   */
  private byPrRepo({ cwd, remote, own }: DirReading, temp: boolean): Place | null {
    // Unrelated runs share `/tmp` itself, so a PR from one of them says nothing about the others
    const eligible = (isGoneDir(remote) || temp) && !isTempRoot(own.path);
    const repo = eligible ? this.prRepoOf(cwd) : null;
    if (!repo) return null;
    // Resolved as if the PRs' repository were the directory's remote, so it merges the same way
    return this.placeByDir(resolveProject(cwd, () => `https://${repo}`));
  }

  /**
   * `placeOf` for a directory that already has sessions, or null to leave them where they are. A
   * directory that is gone can't have its remote read any more, so only the rules that don't need
   * it (`byRule`) may move it, and never away from a repository it was already placed in.
   */
  private replaceOf(dir: DirReading, ctx: PlacementContext): Place | null {
    if (!isGoneDir(dir.remote)) return this.placeOf(dir, ctx);
    if (this.q.repoOfCwd.get(dir.cwd)) return null;
    return this.byRule(dir, ctx);
  }

  /** The project row of a resolved directory, with its label. */
  private placeByDir(p: ProjectRef): Place {
    return { id: this.projectId(p), label: p.label };
  }

  /**
   * The repository (`host/owner/repo`) a session works in: its project's, else the one its launch
   * directory's PRs point to (see `prRepoOf`), as for a clone with no remote. Null when neither says.
   */
  sessionRepo(sessionId: string): string | null {
    const row = this.q.sessionRepo.get(sessionId) as SessionRepoRow | null;
    return row?.repo ?? (row?.launch_cwd ? this.prRepoOf(row.launch_cwd) : null);
  }

  /**
   * The repository (`host/owner/repo`) of every PR opened from sessions launched in `cwd`, or null
   * when there are none or they point to more than one: a shared path like `/work/clone` may hold
   * different repositories over time, and then the PRs can't say which. A URL of another shape
   * says nothing either way and is skipped.
   */
  private prRepoOf(cwd: string): string | null {
    const urls = this.q.prUrlsOfCwd.all(cwd) as { ref: string }[];
    const repos = new Set(urls.flatMap((r) => repoOfPrUrl(r.ref)?.key ?? []));
    const [only] = repos;
    return repos.size === 1 && only ? only : null;
  }

  /**
   * The project of each launch directory, for placing scratchpads. Temporary directories are left
   * out, so a scratchpad never claims another.
   */
  private launchDirProjects(): LaunchDirProjects {
    const rows = this.q.launchDirs.all() as { cwd: string; projectId: number }[];
    return new Map(
      rows.filter((r) => !isTemporary(r.cwd)).map((r) => [encodeDir(r.cwd), r.projectId]),
    );
  }

  /** PRs recorded from a file so far. */
  prCount(fileId: number): number {
    return (this.q.filePrCount.get(fileId) as { n: number }).n;
  }

  /**
   * Re-places the sessions launched where `sessionId` was when this read of its file added a PR
   * (the file had `prsBefore` PRs before it): a PR can be what tells which repository a gone or
   * temporary directory holds. Returns the sessions it moved, which may lie in any period.
   */
  replaceAfterPr(sessionId: string, prsBefore: number, fileId: number): string[] {
    if (this.prCount(fileId) <= prsBefore) return [];
    const cwd = (this.q.sessionInfo.get(sessionId) as SessionInfoRow | null)?.launch_cwd;
    if (!cwd) return [];
    const remote = this.remoteOf(cwd);
    // Only these directories take a PR's repository; skip the usual case of a live checkout
    if (!isGoneDir(remote) && !isTemporary(cwd)) return [];
    const place = this.replaceOf(this.read(cwd, remote), this.context());
    if (!place) return [];
    const moved = this.reassign(place, cwd);
    this.q.deleteOrphanProjects.run();
    return moved;
  }

  /**
   * The projects (null for none) of the sessions in each launch directory `placeWaiting` looks at.
   * A directory can be split across several when its sessions were placed at different times.
   */
  private unsettledDirs(): Map<string, Set<number | null>> {
    const rows = this.q.unsettledLaunchDirs.all() as { cwd: string; projectId: number | null }[];
    const dirs = new Map<string, Set<number | null>>();
    for (const { cwd, projectId } of rows)
      dirs.set(cwd, (dirs.get(cwd) ?? new Set()).add(projectId));
    return dirs;
  }

  /** Moves every session launched in `cwd` to the place, returning their IDs. */
  private reassign(place: Place, cwd: string): string[] {
    this.q.reassignProject.run(place.id, place.label, cwd);
    return (this.q.sessionsLaunchedIn.all(cwd) as { id: string }[]).map((r) => r.id);
  }

  /**
   * Re-places the directories whose place depends on projects that may have been read after them
   * (log folders are read in name order, so `~/` comes before `~/dev/app`): unassigned ones, such
   * as a scratchpad waiting for its owner, and ones in a project without a repository, such as a
   * folder of clones read before the clones. Returns the sessions it moved.
   */
  placeWaiting(): string[] {
    const ctx = this.context();
    const moved = [...this.unsettledDirs()].flatMap(([cwd, projectIds]) => {
      const place = this.replaceOf(this.read(cwd, this.remoteOf(cwd)), ctx);
      const settled = projectIds.size === 1 && projectIds.has(place?.id ?? null);
      return place && !settled ? this.reassign(place, cwd) : [];
    });
    if (moved.length > 0) this.q.deleteOrphanProjects.run();
    return moved;
  }

  /**
   * Reassigns every session's project from its startup cwd (for when the assignment rules change).
   * Sessions whose directory is gone stay as they are unless a rule other than the git remote
   * places them (see `replaceOf`); projects left without sessions are deleted.
   */
  reassignProjects(): void {
    const cwds = this.q.launchCwds.all() as { cwd: string }[];
    const ctx = this.context();
    for (const { cwd } of cwds) {
      const place = this.replaceOf(this.read(cwd, this.remoteOf(cwd)), ctx);
      if (place) this.q.reassignProject.run(place.id, place.label, cwd);
    }
    // The pass may have found repositories the rules compare against, so settle on what it found
    this.placeWaiting();
    this.q.deleteOrphanProjects.run();
  }

  /** Returns the project row (creating it if needed). With a remote, rows of the same repository are merged. */
  private projectId(p: ProjectRef): number {
    // Looked up first so re-placing a directory in its own project (`placeWaiting`) writes nothing
    if (!p.repo) return this.projectIdByPath(p.path) ?? this.createProject(p);
    const byRepo = this.q.projectByRepo.get(p.repo) as { id: number } | null;
    if (byRepo) return byRepo.id;
    // If a row was created before the remote was known, take it over, keeping its color and hidden setting
    const byPath = this.projectIdByPath(p.path);
    if (byPath === null) return this.createProject(p);
    this.q.adoptRepo.run(p.repo, p.name, byPath);
    return byPath;
  }

  /** The project row whose path is `path`, or null when there is none. */
  private projectIdByPath(path: string): number | null {
    return (this.q.projectByPath.get(path) as { id: number } | null)?.id ?? null;
  }

  /** Creates the project row of a directory (or returns the one already at its path). */
  private createProject(p: ProjectRef): number {
    return (this.q.upsertProject.get(p.path, p.name, p.repo) as { id: number }).id;
  }
}

/**
 * Placement of a Claude Code scratchpad with the project of the session that made it (`dirs` from
 * `launchDirProjects`), or null when it isn't one or its owner isn't placed yet.
 */
export function byScratchpadOwner(cwd: string, dirs: LaunchDirProjects): Place | null {
  const owner = scratchpadOwner(cwd);
  const parent = owner ? dirs.get(owner) : undefined;
  return parent !== undefined ? { id: parent, label: runLabel(cwd) } : null;
}

/**
 * Placement of a directory in Claude Code's configuration: a log folder joins the project of the
 * sessions it holds (`dirs` from `launchDirProjects`), and anything else there is no project. Null
 * for a directory outside it.
 */
export function byClaudeDir(path: string, dirs: LaunchDirProjects): Place | null {
  if (!isClaudeDir(path)) return null;
  const owner = logDirOwner(path);
  return { id: (owner ? dirs.get(owner) : undefined) ?? null, label: null };
}

/**
 * No project for a directory that holds another project's repository (`repoPaths`), such as the
 * home directory or a folder of clones: work launched there may be about any of them. Null for any
 * other.
 */
export function byHeldRepos(own: ProjectRef, repoPaths: readonly string[]): Place | null {
  const holds = repoPaths.some((path) => path.startsWith(`${own.path}/`));
  return holds ? { id: null, label: own.label } : null;
}

/** No project for a temporary directory (`temp`), labelled with its name; null for any other. */
function byTemporaryDir(cwd: string, temp: boolean): Place | null {
  return temp ? { id: null, label: runLabel(cwd) } : null;
}

/**
 * Secondary label of a run in a temporary directory or scratchpad: the directory's name, which
 * often says what the run was for (`loop-deny-probe`, `permtest`). A scratchpad's own root says
 * nothing, so it gets none.
 */
export function runLabel(cwd: string): string | null {
  const name = basename(cwd);
  return name === "scratchpad" ? null : name;
}
