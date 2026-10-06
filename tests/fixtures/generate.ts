#!/usr/bin/env bun
// Writes fictional logs laid out like ~/.claude into tests/fixtures/claude/.
// Run: bun tests/fixtures/generate.ts
// See tests/fixtures/README.md for each scenario's expectations.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LogBuilder, type Rec } from "./builder.ts";
import { SID } from "./ids.ts";

const ROOT = join(import.meta.dir, "claude");
const APP = "/Users/me/dev/app";
const BLOG = "/Users/me/dev/blog";

/** Directory name with / and . in the path replaced by -, as Claude Code does. */
export function projectDirName(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

function write(launchCwd: string, b: LogBuilder, tail = ""): void {
  const path = join(ROOT, "projects", projectDirName(launchCwd), `${b.sessionId}.jsonl`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, b.toJsonl() + tail);
}

function header(b: LogBuilder): void {
  b.meta("mode", { mode: "normal" });
  b.meta("permission-mode", { permissionMode: "auto" });
}

// ---------------------------------------------------------------- 1. basic session
function basic(): void {
  const b = new LogBuilder(SID.basic, APP, "feature/login");
  header(b);
  b.attachment(0, { type: "environment" });
  b.prompt(0, "ログインフォームを実装して。バリデーションも付けてほしい");
  b.attachment(0, { type: "total_tokens_reminder" });
  b.thinking(0.2, "まず既存のフォーム部品を確認する");
  b.bash(0.5, "ls src/components", "Button.tsx\nInput.tsx");
  const edit = b.toolUse(1, "Edit", {
    file_path: `${APP}/src/LoginForm.tsx`,
    old_string: "",
    new_string: "export function LoginForm() {}",
  });
  b.toolResult(1, edit, "The file has been updated.", {
    result: { filePath: `${APP}/src/LoginForm.tsx` },
  });
  b.bash(3, "bun test", "8 pass\n0 fail");
  b.bash(
    4,
    "git commit -m \"$(cat <<'EOF'\nfeat: add login form\nEOF\n)\"",
    "[feature/login 1a2b3c4] feat: add login form\n 2 files changed, 48 insertions(+)",
  );
  b.bash(4.5, 'git commit -m "chore: retry"', "nothing to commit, working tree clean", true);
  // Common in real logs: silence output with -q, then check with git log
  b.bash(
    4.7,
    'git commit -q -m "fix: validate email" && git log --oneline -2',
    "9f8e7d6 fix: validate email\n1a2b3c4 feat: add login form",
  );
  b.text(5, "ログインフォームを実装し、コミットしました。");
  b.turnEnd(5);
  b.meta("ai-title", { aiTitle: "ログインフォーム実装" });
  b.meta("last-prompt", { lastPrompt: "ログインフォームを実装して。バリデーションも付けてほしい" });

  // 40-minute gap → separate work blocks
  b.prompt(45, "PR を作って", "suggestion_accepted");
  const bg = b.toolUse(45.5, "Bash", { command: "bun run e2e", run_in_background: true });
  b.toolResult(45.5, bg, "Command running in background with ID: bg01");
  b.taskNotification(47, "bg01", "completed", "e2e: 12 passed");
  b.peerMessage(47.5, "a10b6d4", "[Subagent hand-back] レビュー完了。指摘なし");
  b.bash(48, "gh pr create --fill", "https://github.com/me/app/pull/42");
  b.meta("pr-link", {
    prNumber: 42,
    prUrl: "https://github.com/me/app/pull/42",
    prRepository: "me/app",
    timestamp: "2026-09-28T00:48:00.000Z",
  });
  b.text(48.5, "PR #42 を作成しました。");
  b.turnEnd(48.5);
  b.prompt(50, "やっぱりタイトルを変えて");
  b.interrupt(50.2);
  b.meta("custom-title", { customTitle: "ログイン機能" });
  b.system(55, "away_summary", {
    content:
      "ログインフォームを実装して PR #42 を作成した。次はレビュー対応。 (disable recaps in /config)",
  });
  b.meta("cost-state", {
    totalCostUSD: 1.23,
    totalDuration: 3_300_000,
    totalLinesAdded: 48,
    totalLinesRemoved: 0,
  });
  write(APP, b);
}

// ---------------------------------------------------------------- 2. /loop
function loop(): void {
  const b = new LogBuilder(SID.loop, APP);
  header(b);
  b.command(0, "/loop", "30m");
  b.systemUser(0, [{ type: "text", text: "# /loop — schedule loop.md tasks\n..." }], {
    isMeta: true,
  });
  const cron = b.toolUse(0.5, "CronCreate", { cron: "*/30 * * * *", prompt: "/loop (loop.md)" });
  b.toolResult(0.5, cron, "Scheduled e3278fca");
  b.text(1, "30 分ごとに loop.md のタスクを実行します。");
  b.turnEnd(1);
  for (let i = 1; i <= 4; i++) {
    const m = i * 30;
    b.system(m, "scheduled_task_fire", {
      content: "Running scheduled task",
      taskId: "e3278fca",
      cron: "*/30 * * * *",
      prompt: "/loop (loop.md)",
    });
    b.scheduledTick(m, "# /loop tick — tasks from loop.md\n- CI の状態を確認する");
    b.bash(m + 0.5, "gh run list --limit 1", "completed success");
    if (i === 2) b.taskNotification(m + 1, `tick${i}`, "completed", "CI green");
    b.text(m + 1, "CI は成功しています。");
    b.turnEnd(m + 1);
  }
  b.prompt(150, "ループ止めて");
  const del = b.toolUse(150.5, "CronDelete", { id: "e3278fca" });
  b.toolResult(150.5, del, "Deleted");
  b.text(151, "停止しました。");
  b.turnEnd(151);
  write(APP, b);
}

// ---------------------------------------------------------------- 3. headless（claude -p / SDK）
function headless(): void {
  const b = new LogBuilder(SID.headless, "/Users/me/tmp/probe");
  b.meta("queue-operation", {
    operation: "enqueue",
    timestamp: "2026-09-28T02:00:00.000Z",
    content: "Run exactly this one Bash command",
  });
  b.systemUser(120, "Run exactly this one Bash command: echo ok", {
    promptSource: "sdk",
    turnOrigin: "sdk",
  });
  b.bash(120.1, "echo ok", "ok");
  b.text(120.2, "ok");
  write("/Users/me/tmp/probe", b);
}

// ---------------------------------------------------------------- 4. started in a worktree
function worktree(): void {
  const cwd = `${APP}/.claude/worktrees/fix-header`;
  const b = new LogBuilder(SID.worktree, cwd, "worktree-fix-header");
  header(b);
  b.prompt(200, "ヘッダーの崩れを直して");
  b.bash(201, "bun run build", "built");
  b.text(202, "直しました。");
  b.turnEnd(202);
  write(cwd, b);
}

// ---------------------------------------------------------------- 5. moved into a worktree midway
function relocated(): void {
  const wt = `${APP}/.claude/worktrees/refactor-api`;
  const b = new LogBuilder(SID.relocated, APP, "main");
  header(b);
  b.prompt(240, "API 層をリファクタしたい。worktree で作業して");
  const enter = b.toolUse(240.5, "EnterWorktree", { name: "refactor-api" });
  b.toolResult(240.5, enter, `Entered worktree at ${wt}`);
  b.meta("worktree-state", {
    worktreeSession: {
      originalCwd: APP,
      worktreePath: wt,
      worktreeName: "refactor-api",
      worktreeBranch: "worktree-refactor-api",
      originalBranch: "main",
    },
  });
  b.meta("relocated", { relocatedCwd: wt });
  b.cwd = wt;
  b.gitBranch = "worktree-refactor-api";
  b.bash(242, "bun test", "20 pass");
  b.text(243, "リファクタが終わりました。");
  b.turnEnd(243);
  write(APP, b);
}

// ---------------------------------------------------------------- 6. subagents
function subagent(): void {
  const agentId = "a1b2c3d4e5f60718";
  const b = new LogBuilder(SID.subagent, APP);
  header(b);
  b.prompt(300, "この PR をレビューして");
  const call = b.toolUse(300.5, "Agent", {
    subagent_type: "code-reviewer",
    description: "PR #42 のレビュー",
    prompt: "PR #42 をレビューして",
  });
  b.toolResult(305, call, "指摘は 2 件です。", {
    result: { status: "completed", agentId, totalTokens: 52_000 },
  });
  b.text(305.5, "レビュー結果: 指摘は 2 件です。");
  b.turnEnd(305.5);
  write(APP, b);

  const s = new LogBuilder(SID.subagent, APP, "main", { agentId });
  s.systemUser(300.6, "PR #42 をレビューして");
  s.bash(301, "gh pr diff 42", "diff --git a/src/LoginForm.tsx ...");
  s.text(304.5, "指摘は 2 件です。");
  const dir = join(ROOT, "projects", projectDirName(APP), SID.subagent, "subagents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agentId}.jsonl`), s.toJsonl());
  writeFileSync(
    join(dir, `agent-${agentId}.meta.json`),
    JSON.stringify({
      agentType: "code-reviewer",
      description: "PR #42 のレビュー",
      toolUseId: call,
      spawnDepth: 1,
    }),
  );
}

// ---------------------------------------------------------------- 7. compaction
function compaction(): void {
  const b = new LogBuilder(SID.compaction, APP);
  header(b);
  b.prompt(360, "大きめの調査をお願い");
  b.bash(361, "rg -n TODO", "src/a.ts:1: TODO");
  b.text(362, "調査しました。");
  b.turnEnd(362);
  b.command(380, "/compact");
  b.systemUser(
    371,
    "<local-command-stdout>Compacted (ctrl+o to see full summary)</local-command-stdout>",
  );
  b.system(381, "compact_boundary", {
    content: "Conversation compacted",
    compactMetadata: {
      trigger: "manual",
      preTokens: 406_235,
      postTokens: 17_518,
      durationMs: 47_877,
    },
  });
  b.compactSummary(
    371,
    "This session is being continued from a previous conversation. Summary: 調査を行った。",
  );
  b.prompt(382, "続きをお願い");
  b.text(383, "続きを進めました。");
  b.turnEnd(373);
  write(APP, b);
}

// ---------------------------------------------------------------- 8. continued session
function continued(): void {
  const a = new LogBuilder(SID.continuedFrom, APP);
  header(a);
  a.prompt(420, "前半の作業");
  a.text(421, "前半を終えました。");
  a.turnEnd(421);
  a.meta("continued-in", {
    timestamp: "2026-09-28T07:02:00.000Z",
    continuedInSessionId: SID.continuedTo,
  });
  write(APP, a);

  const b = new LogBuilder(SID.continuedTo, APP);
  // A continued session starts with a copy of the previous conversation, uuids and times unchanged, only sessionId rewritten
  // Turn durations (system/turn_duration) are copied under the same uuids too
  for (const r of a.records.filter(
    (r) => r.type === "user" || r.type === "assistant" || r.subtype === "turn_duration",
  ))
    b.raw({ ...r, sessionId: SID.continuedTo });
  header(b);
  const p = b.prompt(425, "後半の作業");
  b.raw({ ...p }); // duplicate line with the same uuid
  b.text(426, "後半を終えました。");
  b.turnEnd(426);
  write(APP, b);
}

// ---------------------------------------------------------------- 9. partial line
function partial(): void {
  const b = new LogBuilder(SID.partial, APP);
  header(b);
  b.prompt(480, "書き込み途中のテスト");
  b.text(481, "完了した行");
  const next: Rec = {
    type: "assistant",
    uuid: "half-written",
    timestamp: "2026-09-28T08:02:00.000Z",
    message: { content: [{ type: "text", text: "書きかけ" }] },
  };
  write(APP, b, JSON.stringify(next).slice(0, 60)); // cut off without a newline
}

// ---------------------------------------------------------------- 10. another project, another day
function blog(): void {
  const b = new LogBuilder(SID.blog, BLOG);
  header(b);
  b.prompt(1440 + 60, "ブログ記事「Bun で始める SQLite」の下書きを書いて");
  b.text(1440 + 62, "下書きを書きました。");
  b.turnEnd(1440 + 62);
  write(BLOG, b);
}

// ---------------------------------------------------------------- 11. PR titles
function prTitles(): void {
  const b = new LogBuilder(SID.prTitles, APP);
  header(b);
  b.prompt(540, "パスワード再設定の PR を 3 つに分けて作って");
  // --title "…"; pr-link after the result
  b.ghPrCreate(
    541,
    'git push -u origin HEAD && gh pr create --base main --title "feat: パスワード再設定メールを送る" --body "$(cat <<\'EOF\'\n## 概要\n- 再設定用のリンクを送る\nEOF\n)"',
    { number: 43, repository: "me/app" },
  );
  // -t '…'; pr-link before the result
  b.ghPrCreate(
    543,
    "gh pr create -t 'fix: リンクの有効期限を 30 分にする' -b '期限切れの扱いを直す' --draft",
    { number: 44, repository: "me/app" },
    { linkFirst: true },
  );
  // Title decided at run time ($(…)), so not used
  b.ghPrCreate(545, 'gh pr create --title "$(head -1 .pr-title)" --body-file .pr-body', {
    number: 45,
    repository: "me/app",
  });
  b.text(546, "PR を 3 つ作りました。");
  b.turnEnd(546);
  write(APP, b);
}

// ---------------------------------------------------------------- 12. token usage
function usage(): void {
  const b = new LogBuilder(SID.usage, APP);
  header(b);
  b.prompt(600, "依存関係を最新にして");
  // One response (thinking, text, tool_use) split into 3 records; counted once
  b.response(
    600.5,
    [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "package.json を確かめます。" },
      { type: "tool_use", id: "toolu_usage0001", name: "Bash", input: { command: "bun outdated" } },
    ],
    { input: 2_000, output: 900, cacheRead: 30_000, cache5m: 0, cache1h: 8_000 },
  );
  b.toolResult(601, "toolu_usage0001", "react 19.2.0 → 19.3.0");
  b.apiError(602, "API Error: 529 Overloaded");
  b.response(
    603,
    [{ type: "text", text: "react を 19.3.0 に上げました。" }],
    { input: 500, output: 300, cacheRead: 40_000, cache5m: 1_000, cache1h: 0 },
    { model: "claude-sonnet-5-5", effort: "medium" },
  );
  b.turnEnd(603, 170_000);
  write(APP, b);
}

// ---------------------------------------------------------------- 13. prompt-less fragments
function fragments(): void {
  const b = new LogBuilder(SID.fragments, APP);
  header(b);
  b.prompt(660, "キャッシュの層を足して");
  const bg = b.toolUse(660.5, "Bash", { command: "bun run bench", run_in_background: true });
  b.toolResult(660.5, bg, "Command running in background with ID: bg02");
  b.text(662, "ベンチマークをバックグラウンドで回しています。");
  b.turnEnd(662);
  // A notification long after the work, answered with a short reply only → no block
  b.taskNotification(700, "bg02", "completed", "bench: 1.8x faster");
  b.text(700.2, "ベンチマークが終わりました。1.8 倍速くなっています。");
  b.turnEnd(700.2);
  // A notification that Claude acts on (tools, a commit) without a prompt → still a block
  b.taskNotification(760, "bg03", "completed", "lint: 2 warnings");
  b.bash(761, "bun run format", "Formatted 2 files");
  b.bash(
    764,
    'git commit -am "style: fix lint warnings"',
    "[main 5e6f7a8] style: fix lint warnings\n 2 files changed, 4 insertions(+)",
  );
  b.text(765, "警告を直してコミットしました。");
  b.turnEnd(765);
  // Only a compaction and an API error after a long break → no block
  b.system(820, "compact_boundary", {
    content: "Conversation compacted",
    compactMetadata: { trigger: "auto", preTokens: 300_000, postTokens: 15_000 },
  });
  b.apiError(820.1, "API Error: 529 Overloaded");
  write(APP, b);
}

// ---------------------------------------------------------------- 14. usage iterations
function iterations(): void {
  const b = new LogBuilder(SID.iterations, APP);
  header(b);
  b.prompt(880, "長い調査の続きをお願い");
  // Top-level fields are all zero; the amounts are only in the single message step
  b.iteratedResponse(
    880.5,
    [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "前回の結果から続けます。" },
    ],
    { input: 0, output: 0, cacheRead: 0, cache5m: 0, cache1h: 0 },
    [{ type: "message", input: 3, output: 1_200, cacheRead: 50_000, cache5m: 0, cache1h: 2_000 }],
  );
  // Server-side compaction ran first: billed as its own step, left out of the top-level fields
  b.iteratedResponse(
    882,
    [{ type: "text", text: "要約してから続けました。" }],
    { input: 4, output: 400, cacheRead: 0, cache5m: 0, cache1h: 20_000 },
    [
      { type: "compaction", input: 150_000, output: 3_000 },
      { type: "message", input: 4, output: 400, cacheRead: 0, cache5m: 0, cache1h: 20_000 },
    ],
  );
  b.turnEnd(882);
  write(APP, b);
}

// ---------------------------------------------------------------- 15. PR merges
function merges(): void {
  const b = new LogBuilder(SID.merges, APP);
  header(b);
  b.prompt(500, "レビュー済みの PR をまとめてマージして");
  // Quiet success: gh pr merge prints nothing
  b.bash(501, "gh pr merge 46 --squash", "");
  // Failed merge → not counted
  b.bash(
    502,
    "gh pr merge 47 --squash",
    "X Pull request me/app#47 is not mergeable: the base branch policy prohibits the merge.",
    true,
  );
  // Newer versions report the merge in gitOperation (number only, no URL)
  const id = b.toolUse(503, "Bash", { command: "gh pr merge 48 --squash --delete-branch" });
  b.toolResult(503, id, "", {
    result: {
      stdout: "",
      stderr: "",
      interrupted: false,
      isImage: false,
      noOutputExpected: false,
      gitOperation: { pr: { action: "merged", number: 48 } },
    },
  });
  // Only mentions the command → not counted
  b.bash(504, 'grep -n "gh pr merge" docs/release.md', "12:  gh pr merge <number> --squash");
  // Merge after a check in the same call
  b.bash(504.5, "gh pr view 49 --json state && gh pr merge 49 --squash", '{"state":"OPEN"}');
  b.text(505, "#46、#48、#49 をマージしました。#47 はブランチ保護でマージできませんでした。");
  b.turnEnd(505);
  write(APP, b);
}

if (import.meta.main) {
  rmSync(ROOT, { recursive: true, force: true });
  for (const scenario of [
    basic,
    loop,
    headless,
    worktree,
    relocated,
    subagent,
    compaction,
    continued,
    partial,
    blog,
    prTitles,
    usage,
    fragments,
    iterations,
    merges,
  ]) {
    scenario();
  }
  console.log(`fixtures written to ${ROOT}`);
}
