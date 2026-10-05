#!/usr/bin/env bun
// tests/fixtures/claude/ に、~/.claude と同じ構成の架空ログを書き出す。
// 実行: bun tests/fixtures/generate.ts
// シナリオごとの期待値は tests/fixtures/README.md を参照。

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LogBuilder, type Rec } from "./builder.ts";
import { SID } from "./ids.ts";

const ROOT = join(import.meta.dir, "claude");
const APP = "/Users/me/dev/app";
const BLOG = "/Users/me/dev/blog";

/** Claude Code と同じく、パスの / と . を - に置き換えたディレクトリ名。 */
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

// ---------------------------------------------------------------- 1. 通常のセッション
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
  // 実ログに多い形: -q で出力を抑え、git log で確かめる
  b.bash(
    4.7,
    'git commit -q -m "fix: validate email" && git log --oneline -2',
    "9f8e7d6 fix: validate email\n1a2b3c4 feat: add login form",
  );
  b.text(5, "ログインフォームを実装し、コミットしました。");
  b.turnEnd(5);
  b.meta("ai-title", { aiTitle: "ログインフォーム実装" });
  b.meta("last-prompt", { lastPrompt: "ログインフォームを実装して。バリデーションも付けてほしい" });

  // 40 分空く → 作業ブロックが分かれる
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

// ---------------------------------------------------------------- 4. worktree で起動
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

// ---------------------------------------------------------------- 5. 途中で worktree に移動
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

// ---------------------------------------------------------------- 6. サブエージェント
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

// ---------------------------------------------------------------- 8. 続きのセッション
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
  // 続きのセッションは、前のセッションの会話を uuid・時刻はそのまま、sessionId だけ書き換えてコピーして始まる
  for (const r of a.records.filter((r) => r.type === "user" || r.type === "assistant"))
    b.raw({ ...r, sessionId: SID.continuedTo });
  header(b);
  const p = b.prompt(425, "後半の作業");
  b.raw({ ...p }); // 同じ uuid の重複行
  b.text(426, "後半を終えました。");
  b.turnEnd(426);
  write(APP, b);
}

// ---------------------------------------------------------------- 9. 書きかけの行
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
  write(APP, b, JSON.stringify(next).slice(0, 60)); // 改行なしで途切れる
}

// ---------------------------------------------------------------- 10. 別プロジェクト・別の日
function blog(): void {
  const b = new LogBuilder(SID.blog, BLOG);
  header(b);
  b.prompt(1440 + 60, "ブログ記事「Bun で始める SQLite」の下書きを書いて");
  b.text(1440 + 62, "下書きを書きました。");
  b.turnEnd(1440 + 62);
  write(BLOG, b);
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
  ]) {
    scenario();
  }
  console.log(`fixtures written to ${ROOT}`);
}
