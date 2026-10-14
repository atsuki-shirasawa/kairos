import { describe, expect, test } from "bun:test";
import type { Artifact } from "../../src/shared/api.ts";
import { outcomeNode, prLinkParts, shortSha } from "../../src/web/src/lib/artifacts.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 00:00

describe("prLinkParts", () => {
  test("reads the number from the URL and the repository from a title-less PR", () => {
    expect(
      prLinkParts({
        kind: "pr",
        ref: "https://github.com/o/r/pull/42",
        title: "#42 o/r",
        ts: null,
      }),
    ).toEqual({ num: "42", repo: "o/r" });
    expect(
      prLinkParts({ kind: "pr", ref: "https://example.com/x", title: "Fix it", ts: null }),
    ).toEqual({ num: undefined, repo: undefined });
  });
});

describe("shortSha", () => {
  test("shortens SHAs and skips subject-only commits", () => {
    expect(shortSha({ kind: "commit", ref: "0123456789abcdef", title: null, ts: null })).toBe(
      "0123456",
    );
    expect(shortSha({ kind: "commit", ref: "subject:Fix it", title: null, ts: null })).toBeNull();
  });
});

describe("outcomeNode", () => {
  const pr: Artifact = { kind: "pr", ref: "https://github.com/o/r/pull/30", title: null, ts: DAY0 };
  const commit: Artifact = { kind: "commit", ref: "2023692abcdef", title: "fix", ts: DAY0 };

  test("a PR when the outcome names one of the section's PRs", () => {
    expect(outcomeNode("Merged PR #30 and closed #19", [commit, pr])).toBe("pr");
  });

  test("a commit when it names one of the section's commits by SHA", () => {
    expect(outcomeNode("main is at `2023692`", [commit, pr])).toBe("commit");
  });

  test("a commit when the outcome quotes a longer SHA than the one recorded", () => {
    const short: Artifact = { ...commit, ref: "2023692" };
    expect(outcomeNode("main is at 2023692abcdef01", [short])).toBe("commit");
  });

  test("none for numbers and SHAs the section doesn't have", () => {
    expect(outcomeNode("Closed #19 at 1234567", [commit, pr])).toBeNull();
    expect(outcomeNode("Merged PR #30", [])).toBeNull();
  });
});
