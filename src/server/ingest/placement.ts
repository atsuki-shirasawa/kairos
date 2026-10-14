// Which project each session belongs to, decided from its startup cwd. The rules run when a
// session's launch is first seen, again when a PR names a repository, and over every session when
// DERIVED_VERSION changes.
import { basename } from "node:path";
import {
  encodeDir,
  isGoneDir,
  isTemporary,
  type ProjectRef,
  projectDir,
  type RemoteLookup,
  type RemoteReading,
  repoOfPrUrl,
  resolveProject,
  scratchpadOwner,
  TEMP_PROJECT,
} from "./project.ts";
import type { SessionInfoRow, Statements } from "./statements.ts";

/** Where a session belongs: its project row, and the secondary label shown beside the name. */
export interface Place {
  id: number;
  label: string | null;
}

/**
 * The project of each launch directory, keyed by the name Claude Code encodes it to (see
 * `encodeDir`), as `ProjectPlacer.launchDirProjects` reads it for placing scratchpads.
 */
export type LaunchDirProjects = Map<string, number>;

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
    return this.placeOf(cwd, this.remoteOf(cwd), this.launchDirProjects());
  }

  /**
   * Where sessions launched in `cwd` belong: the project row and secondary label. `remote` is the
   * directory's git remote as `lookupRemote` reads it, and `dirs` comes from `launchDirProjects`.
   * The first rule that places it wins, in order: the git remote, the repository of its PRs, the
   * scratchpad's owner, the shared temporary project, and the directory itself.
   */
  private placeOf(cwd: string, remote: RemoteReading, dirs: LaunchDirProjects): Place {
    const own = resolveProject(cwd, () => remote);
    const temp = isTemporary(cwd);
    return (
      this.byRemote(own) ??
      this.byPrRepo(cwd, remote, own, temp) ??
      byScratchpadOwner(cwd, dirs) ??
      this.byTemporaryDir(cwd, temp) ??
      this.placeByDir(own)
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
  private byPrRepo(
    cwd: string,
    remote: RemoteReading,
    own: ProjectRef,
    temp: boolean,
  ): Place | null {
    // `/tmp` itself is the shared project's path, which a repository must never take over
    const eligible = (isGoneDir(remote) || temp) && own.path !== TEMP_PROJECT.path;
    const repo = eligible ? this.prRepoOf(cwd) : null;
    if (!repo) return null;
    // Resolved as if the PRs' repository were the directory's remote, so it merges the same way
    return this.placeByDir(resolveProject(cwd, () => `https://${repo}`));
  }

  /** Placement of a temporary directory (`temp`) in the shared `TEMP_PROJECT`, or null for any other. */
  private byTemporaryDir(cwd: string, temp: boolean): Place | null {
    if (!temp) return null;
    return {
      id: this.projectId({ ...TEMP_PROJECT, label: null, repo: null }),
      label: runLabel(cwd),
    };
  }

  /**
   * `placeOf` for sessions already assigned, or null to leave them where they are. A directory that
   * is gone can't have its remote read any more, so only the rules that don't need it (PRs,
   * scratchpad, temporary) may move it, and never away from a repository it was already placed in.
   */
  private replaceOf(cwd: string, remote: RemoteReading, dirs: LaunchDirProjects): Place | null {
    if (!isGoneDir(remote)) return this.placeOf(cwd, remote, dirs);
    if (this.q.repoOfCwd.get(cwd)) return null;
    if (!isTemporary(cwd) && !scratchpadOwner(cwd) && !this.prRepoOf(cwd)) return null;
    return this.placeOf(cwd, remote, dirs);
  }

  /** The project row of a resolved directory, with its label. */
  private placeByDir(p: ProjectRef): Place {
    return { id: this.projectId(p), label: p.label };
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
   * temporary directory holds.
   */
  replaceAfterPr(sessionId: string, prsBefore: number, fileId: number): void {
    if (this.prCount(fileId) <= prsBefore) return;
    const cwd = (this.q.sessionInfo.get(sessionId) as SessionInfoRow | null)?.launch_cwd;
    if (!cwd) return;
    const remote = this.remoteOf(cwd);
    // Only these directories take a PR's repository; skip the usual case of a live checkout
    if (!isGoneDir(remote) && !isTemporary(cwd)) return;
    const place = this.replaceOf(cwd, remote, this.launchDirProjects());
    if (!place) return;
    this.q.reassignProject.run(place.id, place.label, cwd);
    this.q.deleteOrphanProjects.run();
  }

  /**
   * Re-places scratchpad runs that went to `TEMP_PROJECT` because their owner's log hadn't been
   * read yet: log folders are read in name order, and the owner's may come later.
   */
  placeWaitingScratchpads(): void {
    const waiting = (this.q.tempLaunchDirs.all(TEMP_PROJECT.path) as { cwd: string }[]).filter(
      (r) => scratchpadOwner(r.cwd),
    );
    if (waiting.length === 0) return;
    const dirs = this.launchDirProjects();
    for (const { cwd } of waiting) {
      const place = byScratchpadOwner(cwd, dirs);
      if (place) this.q.reassignProject.run(place.id, place.label, cwd);
    }
    this.q.deleteOrphanProjects.run();
  }

  /**
   * Reassigns every session's project from its startup cwd (for when the assignment rules change).
   * Sessions whose directory is gone stay as they are unless a rule other than the git remote
   * places them (see `replaceOf`); projects left without sessions are deleted.
   */
  reassignProjects(): void {
    const cwds = this.q.launchCwds.all() as { cwd: string }[];
    const dirs = this.launchDirProjects();
    for (const { cwd } of cwds) {
      const place = this.replaceOf(cwd, this.remoteOf(cwd), dirs);
      if (place) this.q.reassignProject.run(place.id, place.label, cwd);
    }
    this.q.deleteOrphanProjects.run();
  }

  /** Returns the project row (creating it if needed). With a remote, rows of the same repository are merged. */
  private projectId(p: ProjectRef): number {
    if (p.repo) {
      const byRepo = this.q.projectByRepo.get(p.repo) as { id: number } | null;
      if (byRepo) return byRepo.id;
      // If a row was created before the remote was known, take it over, keeping its color and hidden setting
      const byPath = this.q.projectByPath.get(p.path) as { id: number } | null;
      if (byPath) {
        this.q.adoptRepo.run(p.repo, p.name, byPath.id);
        return byPath.id;
      }
    }
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
 * Secondary label of a run in a temporary directory or scratchpad: the directory's name, which
 * often says what the run was for (`loop-deny-probe`, `permtest`). A scratchpad's own root says
 * nothing, so it gets none.
 */
export function runLabel(cwd: string): string | null {
  const name = basename(cwd);
  return name === "scratchpad" ? null : name;
}
