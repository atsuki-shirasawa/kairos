import { mkdirSync } from "node:fs";

export class SummaryError extends Error {}

export interface ClaudeOptions {
  model: string;
  /** Working directory. A dedicated empty directory, so no project's CLAUDE.md or settings are loaded. */
  cwd: string;
  timeoutMs?: number;
}

/**
 * Answers a prompt with `claude -p`. It reuses Claude Code's authentication, so no API key is needed.
 * Runs without saving a session and without tools or MCP, so it has no side effects.
 */
export async function runClaude(prompt: string, opts: ClaudeOptions): Promise<string> {
  const exe = Bun.which("claude");
  if (!exe) throw new SummaryError("claude command not found");
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
    // The exit code of a killed process doesn't say why, so say it timed out
    if (timedOut)
      throw new SummaryError(`Did not finish within ${Math.round(timeoutMs / 1000)} seconds`);
    if (code !== 0 || !out.trim()) {
      throw new SummaryError((err || out || `exit code ${code}`).trim().slice(0, 500));
    }
    return out.trim();
  } finally {
    clearTimeout(timer);
  }
}
