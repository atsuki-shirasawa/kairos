import { describe, expect, test } from "bun:test";
import { LIMIT } from "../../../src/server/ingest/limits.ts";
import { type PendingOutcomes, pendingOutcomes } from "../../../src/server/ingest/outcomes.ts";

describe("pendingOutcomes", () => {
  const cases: [string, string, PendingOutcomes][] = [
    ["Bash", 'git commit -m "feat: add login"', { commit: 'git commit -m "feat: add login"' }],
    ["Bash", "git -C app commit -q", { commit: "git -C app commit -q" }],
    ["Bash", 'gh pr create --title "feat: A" --body x', { prTitle: "feat: A" }],
    ["Bash", "gh pr create --fill", {}],
    ["Bash", "gh pr merge 12 --squash", { merge: { number: 12 } }],
    ["Bash", "gh pr merge --squash", { merge: { number: null } }],
    ["Bash", 'grep "gh pr merge" notes.md', {}],
    ["Bash", "ls -la", {}],
    ["Read", "git commit -m x", {}],
    ["Bash", "", {}],
  ];
  for (const [name, command, expected] of cases) {
    test(`${name}: ${command || "(empty)"}`, () => {
      expect(pendingOutcomes(name, command)).toEqual(expected);
    });
  }

  test("one command can await several outcomes", () => {
    const command = 'git commit -m "fix: x" && gh pr create --title "fix: x" && gh pr merge 7';
    expect(pendingOutcomes("Bash", command)).toEqual({
      commit: command,
      prTitle: "fix: x",
      merge: { number: 7 },
    });
  });

  test("keeps the command and title to the short limit", () => {
    const title = "t".repeat(LIMIT.short + 50);
    const command = `gh pr create --title ${title} # git commit`;
    const outcomes = pendingOutcomes("Bash", command);
    expect(outcomes.commit).toBe(command.slice(0, LIMIT.short));
    expect(outcomes.prTitle).toBe(title.slice(0, LIMIT.short));
  });
});
