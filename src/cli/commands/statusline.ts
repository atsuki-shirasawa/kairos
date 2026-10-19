// `kairos statusline`: Claude Code's status line command, wrapped. Claude Code runs it on every
// update of every session, so it does as little as it can, and nothing it does may break the line.
import { PLAN_LIMITS_PATH } from "../../server/paths.ts";
import { recordPlanLimits } from "../../server/planLimits.ts";
import type { CliContext } from "../args.ts";

/**
 * `kairos statusline [-- command...]`: records the plan's usage limits from the status line input,
 * then runs the given status line command on the same input and passes its output and exit code on.
 * Without a command it prints nothing.
 */
export async function statuslineCommand(ctx: CliContext): Promise<number | undefined> {
  const input = await Bun.stdin.text();
  try {
    recordPlanLimits(PLAN_LIMITS_PATH, input, Date.now());
  } catch {
    // Unreadable input or an unwritable data directory costs only the limits, never the line
  }
  if (ctx.args.length === 0) return;
  return runStatusLine(ctx.args.join(" "), input);
}

/**
 * Runs the wrapped status line command in a shell, as Claude Code runs `statusLine.command`, so a
 * quoted command with pipes or variables behaves as it did unwrapped. Claude Code stops a status
 * line that a newer update replaces, so the stop is passed on rather than leaving the command
 * running.
 */
async function runStatusLine(command: string, input: string): Promise<number | undefined> {
  const child = Bun.spawn(["/bin/sh", "-c", command], {
    stdin: new Blob([input]),
    stdout: "inherit",
    stderr: "inherit",
  });
  const stop = () => child.kill();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return (await child.exited) || undefined;
}
