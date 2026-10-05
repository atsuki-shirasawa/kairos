import { mkdirSync } from "node:fs";

export class SummaryError extends Error {}

export interface ClaudeOptions {
  model: string;
  /** 実行するディレクトリ。プロジェクトの CLAUDE.md や設定を読ませないよう、専用の空ディレクトリを使う。 */
  cwd: string;
  timeoutMs?: number;
}

/**
 * `claude -p` でプロンプトに答えさせる。Claude Code の認証をそのまま使うので API キーは要らない。
 * セッションとして保存しない・ツールと MCP を使わせない設定にして、副作用をなくす。
 */
export async function runClaude(prompt: string, opts: ClaudeOptions): Promise<string> {
  const exe = Bun.which("claude");
  if (!exe) throw new SummaryError("claude コマンドが見つかりません");
  mkdirSync(opts.cwd, { recursive: true });
  const proc = Bun.spawn(
    [
      exe,
      "-p",
      "--model",
      opts.model,
      "--no-session-persistence",
      "--tools",
      "",
      "--strict-mcp-config",
      "--setting-sources",
      "project",
    ],
    { cwd: opts.cwd, stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe" },
  );
  const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 180_000);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0 || !out.trim()) {
      throw new SummaryError((err || out || `終了コード ${code}`).trim().slice(0, 500));
    }
    return out.trim();
  } finally {
    clearTimeout(timer);
  }
}
