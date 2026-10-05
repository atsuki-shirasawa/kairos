import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyUser, commandText, type UserKind } from "../../../src/server/ingest/classify.ts";
import { parseRemote, readGitRemote, resolveProject } from "../../../src/server/ingest/project.ts";
import { toSegments } from "../../../src/server/ingest/segments.ts";

const user = (content: unknown, extra: Record<string, unknown> = {}) => ({
  type: "user",
  message: { role: "user", content },
  ...extra,
});
const human = { origin: { kind: "human" } };

describe("classifyUser", () => {
  test.each<[string, Record<string, unknown>, UserKind]>([
    ["typed のプロンプト", user("hi", { ...human, promptSource: "typed" }), "prompt"],
    ["sdk 経由でも人の入力ならプロンプト", user("hi", { ...human, promptSource: "sdk" }), "prompt"],
    ["スラッシュコマンド", user("<command-name>/loop</command-name>", human), "command"],
    [
      "人の origin でも < で始まる出力は meta",
      user("<local-command-stdout>x</local-command-stdout>", human),
      "meta",
    ],
    ["自動実行", user("# /loop tick", { isMeta: true, turnOrigin: "scheduled" }), "scheduled"],
    [
      "タスク通知",
      user("<task-notification>…", { origin: { kind: "task-notification" } }),
      "notification",
    ],
    ["peer", user("Another Claude session…", { isMeta: true, origin: { kind: "peer" } }), "peer"],
    [
      "中断",
      user([{ type: "text", text: "[Request interrupted by user for tool use]" }]),
      "interrupt",
    ],
    ["ツール結果", user([{ type: "tool_result", tool_use_id: "t", content: "ok" }]), "tool_result"],
    ["compaction の要約", user("Summary", { isCompactSummary: true }), "compact_summary"],
    ["origin なし（claude -p など）", user("Run this", { promptSource: "sdk" }), "meta"],
  ])("%s", (_name, r, expected) => {
    expect(classifyUser(r)).toBe(expected);
  });
});

test("commandText", () => {
  expect(commandText("<command-name>/loop</command-name>\n<command-args>30m</command-args>")).toBe(
    "/loop 30m",
  );
  expect(commandText("<command-name>/compact</command-name><command-args></command-args>")).toBe(
    "/compact",
  );
});

describe("resolveProject", () => {
  const noRemote = () => null;
  const remotes: Record<string, string> = {
    "/Users/me/dev/app": "git@github.com:me/webapp.git",
    "/Users/me/tmp/webapp": "https://github.com/me/webapp",
  };
  const lookup = (dir: string) => remotes[dir] ?? null;

  test("worktree は親リポジトリにまとめ、名前をラベルにする", () => {
    expect(resolveProject("/Users/me/dev/app/.claude/worktrees/fix-x/sub", noRemote)).toEqual({
      path: "/Users/me/dev/app",
      name: "app",
      label: "fix-x",
      repo: null,
    });
  });
  test("通常のディレクトリはそのまま", () => {
    expect(resolveProject("/Users/me/dev/app/", noRemote)).toEqual({
      path: "/Users/me/dev/app",
      name: "app",
      label: null,
      repo: null,
    });
  });
  test("remote があればリポジトリ名にし、違うディレクトリ名はラベルに残す", () => {
    expect(resolveProject("/Users/me/dev/app", lookup)).toEqual({
      path: "/Users/me/dev/app",
      name: "webapp",
      label: "app",
      repo: "github.com/me/webapp",
    });
    // 別のクローンでも鍵は同じ。ディレクトリ名がリポジトリ名と同じならラベルは付けない
    expect(resolveProject("/Users/me/tmp/webapp", lookup)).toMatchObject({
      name: "webapp",
      label: null,
      repo: "github.com/me/webapp",
    });
    // worktree では worktree 名を優先する
    expect(resolveProject("/Users/me/dev/app/.claude/worktrees/fix-x", lookup)).toMatchObject({
      name: "webapp",
      label: "fix-x",
    });
  });
});

describe("parseRemote", () => {
  test("https・scp 形式・ssh の URL から同じ鍵を取り出す", () => {
    for (const url of [
      "https://github.com/Owner/repo.git",
      "git@github.com:Owner/repo.git",
      "ssh://git@github.com/Owner/repo",
      "https://GitHub.com/Owner/repo/",
    ])
      expect(parseRemote(url)).toEqual({ key: "github.com/Owner/repo", name: "repo" });
  });
  test("URL の認証情報は鍵に含めない", () => {
    expect(parseRemote("https://x-access-token:secret@github.com/o/r.git")).toEqual({
      key: "github.com/o/r",
      name: "r",
    });
  });
  test("認証情報やクエリが残りうる形の URL はまとめに使わない", () => {
    expect(parseRemote("user:ghp_ABC@github.com/o/r")).toBeNull();
    expect(parseRemote("https://github.com/o/r%3Ftoken%3Dabc")).toBeNull();
    // scp 形式でも、クエリ以降は鍵に入れない
    expect(parseRemote("git@github.com:o/r.git?token=abc")).toEqual({
      key: "github.com/o/r",
      name: "r",
    });
  });
  test("ローカルパスの remote は使わない", () => {
    expect(parseRemote("/srv/git/repo.git")).toBeNull();
    expect(parseRemote("file:///srv/git/repo.git")).toBeNull();
  });
});

describe("readGitRemote", () => {
  const root = mkdtempSync(join(tmpdir(), "kairos-git-"));
  const config = (url: string) =>
    `[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://example.com/u/x\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;

  test("リポジトリの .git/config から origin を読む", () => {
    const repo = join(root, "repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    writeFileSync(join(repo, ".git", "config"), config("git@github.com:o/r.git"));
    expect(readGitRemote(repo)).toBe("git@github.com:o/r.git");
  });
  test("worktree の .git ファイルから共通の config をたどる", () => {
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
  test("FIFO や大きすぎるファイルは読まない（同期の読み込みで固まらないように）", () => {
    const fifo = join(root, "fifo");
    mkdirSync(fifo);
    Bun.spawnSync(["mkfifo", join(fifo, ".git")]);
    expect(readGitRemote(fifo)).toBeNull();
    const big = join(root, "big");
    mkdirSync(join(big, ".git"), { recursive: true });
    writeFileSync(
      join(big, ".git", "config"),
      `${"#".repeat(70 * 1024)}\n${config("git@github.com:o/r.git")}`,
    );
    expect(readGitRemote(big)).toBeNull();
  });
  test("git でなければ null、ディレクトリがなければ判断できない（undefined）", () => {
    const plain = join(root, "plain");
    mkdirSync(plain);
    expect(readGitRemote(plain)).toBeNull();
    expect(readGitRemote(join(root, "gone"))).toBeUndefined();
  });
});

test("toSegments は間隔より長く空いたところで区切る", () => {
  const m = 60_000;
  expect(toSegments([0, 5 * m, 10 * m, 60 * m, 62 * m], 15 * m)).toEqual([
    [0, 10 * m],
    [60 * m, 62 * m],
  ]);
  expect(toSegments([])).toEqual([]);
});
