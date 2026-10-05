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
  const timeoutMs = opts.timeoutMs ?? 180_000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    // 止めたときの終了コードだけでは理由が分からないので、時間切れと分かる文にする
    if (timedOut)
      throw new SummaryError(`${Math.round(timeoutMs / 1000)} 秒以内に終わりませんでした`);
    if (code !== 0 || !out.trim()) {
      throw new SummaryError((err || out || `終了コード ${code}`).trim().slice(0, 500));
    }
    return out.trim();
  } finally {
    clearTimeout(timer);
  }
}
