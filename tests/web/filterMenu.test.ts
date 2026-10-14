import { describe, expect, test } from "bun:test";
import { hasOutcome } from "../../src/web/src/lib/filter.ts";
import { branchOptions, countBlocks } from "../../src/web/src/lib/filterMenu.ts";
import { session } from "./filterHelpers.ts";

describe("menu counts", () => {
  const busy = session("busy", {
    fields: { branch: "feature/login", scheduledRuns: 2 },
    segments: [
      { headline: "Merge", activity: { merges: 1, subagents: 1 }, minutes: 90 },
      { headline: "Commit", activity: { commits: 1, toolErrors: 1 }, minutes: 20 },
    ],
  });
  const quiet = session("quiet", {
    fields: { active: true, continued: true },
    segments: [{ headline: "Read", activity: { interrupts: 1 }, minutes: 40 }],
  });

  test("counts blocks per option and lists branches busiest first", () => {
    expect(countBlocks([busy, quiet], (_, g) => hasOutcome(g, ["commit"]))).toBe(1);
    const other = session("other", { fields: { branch: "main" } });
    expect(branchOptions([busy, quiet, other], null)).toEqual([
      { name: "feature/login", blocks: 2 },
      { name: "main", blocks: 1 },
    ]);
    // The chosen branch stays listed in a period without it
    expect(branchOptions([quiet], "fix/header")).toEqual([{ name: "fix/header", blocks: 0 }]);
  });
});
