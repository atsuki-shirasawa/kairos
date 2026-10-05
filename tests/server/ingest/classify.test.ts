import { describe, expect, test } from "bun:test";
import { classifyUser, commandText, type UserKind } from "../../../src/server/ingest/classify.ts";
import { resolveProject } from "../../../src/server/ingest/project.ts";
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
  test("worktree は親リポジトリにまとめ、名前をラベルにする", () => {
    expect(resolveProject("/Users/me/dev/app/.claude/worktrees/fix-x/sub")).toEqual({
      path: "/Users/me/dev/app",
      name: "app",
      label: "fix-x",
    });
  });
  test("通常のディレクトリはそのまま", () => {
    expect(resolveProject("/Users/me/dev/app/")).toEqual({
      path: "/Users/me/dev/app",
      name: "app",
      label: null,
    });
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
