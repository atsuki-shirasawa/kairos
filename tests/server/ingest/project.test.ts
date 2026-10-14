import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encodeDir,
  isGoneDir,
  isTemporary,
  MAX_GIT_FILE,
  parseRemote,
  readGitRemote,
  repoOfPrUrl,
  resolveProject,
  scratchpadOwner,
} from "../../../src/server/ingest/project.ts";

describe("resolveProject", () => {
  const noRemote = () => null;
  const remotes: Record<string, string> = {
    "/Users/me/dev/app": "git@github.com:me/webapp.git",
    "/Users/me/tmp/webapp": "https://github.com/me/webapp",
  };
  const lookup = (dir: string) => remotes[dir] ?? null;

  test("groups a worktree under its parent repository and labels it with its name", () => {
    expect(resolveProject("/Users/me/dev/app/.claude/worktrees/fix-x/sub", noRemote)).toEqual({
      path: "/Users/me/dev/app",
      name: "app",
      label: "fix-x",
      repo: null,
    });
  });
  test("a plain directory stays as is", () => {
    expect(resolveProject("/Users/me/dev/app/", noRemote)).toEqual({
      path: "/Users/me/dev/app",
      name: "app",
      label: null,
      repo: null,
    });
  });
  test("uses the repository name with a remote, keeping a different directory name as the label", () => {
    expect(resolveProject("/Users/me/dev/app", lookup)).toEqual({
      path: "/Users/me/dev/app",
      name: "webapp",
      label: "app",
      repo: "github.com/me/webapp",
    });
    // Another clone gets the same key. No label when the directory name matches the repository name
    expect(resolveProject("/Users/me/tmp/webapp", lookup)).toMatchObject({
      name: "webapp",
      label: null,
      repo: "github.com/me/webapp",
    });
    // In a worktree, the worktree name wins
    expect(resolveProject("/Users/me/dev/app/.claude/worktrees/fix-x", lookup)).toMatchObject({
      name: "webapp",
      label: "fix-x",
    });
  });
});

describe("temporary directories", () => {
  test("isTemporary: system temp directories and Claude Code job directories", () => {
    for (const dir of [
      "/tmp",
      "/tmp/probe",
      "/private/tmp/loop.Ab12Cd",
      "/var/folders/xy/abc/T/run",
      "/private/var/folders/xy/abc/T",
      "/Users/me/.claude/jobs/0a1b2c3d/tmp/probe-2",
    ])
      expect(isTemporary(dir)).toBe(true);
    for (const dir of ["/Users/me/tmp/probe", "/tmpfiles", "/work/clone", "/Users/me/.claude/jobs"])
      expect(isTemporary(dir)).toBe(false);
  });

  test("scratchpadOwner: the encoded launch directory of a scratchpad's session", () => {
    const pad = "/private/tmp/claude-501/-Users-me-dev-app/0f1e2d3c-4b5a/scratchpad/check";
    expect(scratchpadOwner(pad)).toBe("-Users-me-dev-app");
    expect(scratchpadOwner("/tmp/claude-501/-Users-me-dev-app/0f1e2d3c/scratchpad")).toBe(
      "-Users-me-dev-app",
    );
    expect(scratchpadOwner("/private/tmp/claude-501/-Users-me-dev-app/0f1e2d3c/notes")).toBeNull();
    expect(encodeDir("/Users/me/dev/my.app")).toBe("-Users-me-dev-my-app");
  });

  test("repoOfPrUrl: the repository of a pull request, keyed as a remote is", () => {
    expect(repoOfPrUrl("https://github.com/me/app/pull/12")).toEqual({
      key: "github.com/me/app",
      name: "app",
    });
    expect(repoOfPrUrl("https://github.com/me/app/issues/12")).toBeNull();
    expect(repoOfPrUrl("not a url")).toBeNull();
  });
});

describe("parseRemote", () => {
  test("extracts the same key from https, scp-style and ssh URLs", () => {
    for (const url of [
      "https://github.com/Owner/repo.git",
      "git@github.com:Owner/repo.git",
      "ssh://git@github.com/Owner/repo",
      "https://GitHub.com/Owner/repo/",
    ])
      expect(parseRemote(url)).toEqual({ key: "github.com/Owner/repo", name: "repo" });
  });
  test("keeps URL credentials out of the key", () => {
    expect(parseRemote("https://x-access-token:secret@github.com/o/r.git")).toEqual({
      key: "github.com/o/r",
      name: "r",
    });
  });
  test("does not group by URLs whose shape may leave credentials or queries", () => {
    expect(parseRemote("user:ghp_ABC@github.com/o/r")).toBeNull();
    expect(parseRemote("https://github.com/o/r%3Ftoken%3Dabc")).toBeNull();
    // Even scp-style, nothing from the query on goes into the key
    expect(parseRemote("git@github.com:o/r.git?token=abc")).toEqual({
      key: "github.com/o/r",
      name: "r",
    });
  });
  test("ignores local-path remotes", () => {
    expect(parseRemote("/srv/git/repo.git")).toBeNull();
    expect(parseRemote("file:///srv/git/repo.git")).toBeNull();
  });
});

describe("readGitRemote", () => {
  const root = mkdtempSync(join(tmpdir(), "kairos-git-"));
  const config = (url: string) =>
    `[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://example.com/u/x\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;

  test("reads origin from the repository's .git/config", () => {
    const repo = join(root, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    writeFileSync(join(repo, ".git", "config"), config("git@github.com:o/r.git"));
    expect(readGitRemote(repo)).toBe("git@github.com:o/r.git");
  });
  test("follows a worktree's .git file to the common config", () => {
    const main = join(root, "main");
    const wtGit = join(main, ".git", "worktrees", "wt");
    mkdirSync(wtGit, { recursive: true });
    writeFileSync(join(main, ".git", "config"), config("https://github.com/o/main.git"));
    writeFileSync(join(wtGit, "commondir"), "../..\n");
    const wt = join(root, "wt");
    mkdirSync(wt);
    writeFileSync(join(wt, ".git"), `gitdir: ${wtGit}\n`);
    expect(readGitRemote(wt)).toBe("https://github.com/o/main.git");
  });
  test("does not read FIFOs or oversized files (so synchronous reads cannot hang)", () => {
    const fifo = join(root, "fifo");
    mkdirSync(fifo);
    Bun.spawnSync(["mkfifo", join(fifo, ".git")]);
    expect(readGitRemote(fifo)).toBeNull();
    const big = join(root, "big");
    mkdirSync(join(big, ".git"), { recursive: true });
    const padded = (n: number) => `${"#".repeat(n)}\n${config("git@github.com:o/r.git")}`;
    writeFileSync(join(big, ".git", "config"), padded(MAX_GIT_FILE));
    expect(readGitRemote(big)).toBeNull();
    // The config of a repository with many branches (over 100KB) can be read
    writeFileSync(join(big, ".git", "config"), padded(200 * 1024));
    expect(readGitRemote(big)).toBe("git@github.com:o/r.git");
  });
  test("null when not a git directory, undefined when the directory is gone", () => {
    const plain = join(root, "plain");
    mkdirSync(plain);
    expect(readGitRemote(plain)).toBeNull();
    expect(readGitRemote(join(root, "gone"))).toBeUndefined();
  });
});

test("isGoneDir tells a gone directory from one without a remote", () => {
  expect(isGoneDir(undefined)).toBe(true);
  expect(isGoneDir(null)).toBe(false);
  expect(isGoneDir("git@github.com:me/app.git")).toBe(false);
});
