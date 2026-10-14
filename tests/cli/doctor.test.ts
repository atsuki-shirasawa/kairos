import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Check, checkHook, checkLiveRegistry, renderChecks } from "../../src/cli/doctor.ts";

/** A Claude config directory whose SessionStart hook runs `command`. */
function claudeDirWith(command: string): string {
  const dir = mkdtempSync(join(tmpdir(), "kairos-doctor-"));
  const hooks = { SessionStart: [{ hooks: [{ type: "command", command }] }] };
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ hooks }));
  return dir;
}

test("the hook check finds `kairos ensure` however the path is quoted or run", () => {
  for (const command of [
    "kairos ensure",
    "'/Users/me/.bun/bin/kairos' ensure 2>/dev/null || true",
    '"/Users/me/.bun/bin/kairos" ensure',
    "bun ~/dev/kairos/src/cli/index.ts ensure",
  ])
    expect(checkHook(claudeDirWith(command)).level).toBe("ok");
  expect(checkHook(claudeDirWith("kairos ensurex")).level).toBe("warn");
  expect(checkHook(claudeDirWith("echo hi")).level).toBe("warn");
});

test("the running-sessions check warns when Claude Code's session registry is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "kairos-doctor-"));
  expect(checkLiveRegistry(dir).level).toBe("warn");
  mkdirSync(join(dir, "sessions"));
  writeFileSync(
    join(dir, "sessions", "7.json"),
    JSON.stringify({
      pid: 7,
      sessionId: "11111111-1111-4111-8111-111111111111",
      cwd: "/x",
      status: "idle",
    }),
  );
  expect(checkLiveRegistry(dir)).toMatchObject({
    level: "ok",
    detail: expect.stringContaining("1 recorded"),
  });
});

test("the report ends by counting what needs attention, or saying all is well", () => {
  const fine: Check = { name: "claude", level: "ok", detail: "2.1" };
  const warned: Check = { name: "server", level: "warn", detail: "not running" };
  const failed: Check = { name: "database", level: "fail", detail: "broken" };
  expect(renderChecks([fine])).toBe("✓ claude  2.1\n\nAll good.");
  expect(renderChecks([fine, warned, warned, failed])).toEndWith("\n\n1 problem, 2 warnings");
  expect(renderChecks([failed], true)).toContain("\x1b[31m✗\x1b[0m");
});
