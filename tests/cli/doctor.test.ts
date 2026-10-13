import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkHook } from "../../src/cli/doctor.ts";

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
