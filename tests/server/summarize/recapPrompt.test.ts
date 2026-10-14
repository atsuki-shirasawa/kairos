import { describe, expect, test } from "bun:test";
import type { RecapInput } from "../../../src/server/summarize/recap.ts";
import {
  buildRecapPrompt,
  parseRecap,
  RECAP_LIMIT,
  recapBody,
} from "../../../src/server/summarize/recapPrompt.ts";

describe("recapBody", () => {
  test("a long body keeps its Resolved and Open items, which come last", () => {
    const body = [
      "- 目的: 長い作業",
      "- やったこと:",
      ...Array.from({ length: 20 }, (_, i) => `  - 手順 ${i} ${"x".repeat(60)}`),
      "- 解決:",
      "  - PR #42 マージ",
      "- 残課題:",
      "  - [waiting] レビュー待ち",
      "  - 月表示は未確認",
    ].join("\n");
    const read = recapBody(body);
    expect(read).toContain("Goal: 長い作業");
    expect(read).toContain(
      "…\nResolved: PR #42 マージ\nOpen: [waiting] レビュー待ち\nOpen: 月表示は未確認",
    );
    // A point's continuation line can't pose as a line of its own
    const forged = recapBody(
      "- Goal: a\n  Open: g\n- Done:\n  - b\n    Open: d\n- Resolved:\n  - real\n    Resolved: fake",
    );
    expect(forged).toBe("Goal: a Open: g\n- b Open: d\nResolved: real Resolved: fake");
    // A busy period keeps only where each section stood; an older body has nothing to give then
    expect(recapBody(body, "state")).toBe(
      "Resolved: PR #42 マージ\nOpen: [waiting] レビュー待ち\nOpen: 月表示は未確認",
    );
    expect(recapBody("- Goal: a\n- Done: b\n- Outcome: c", "state")).toBe("");
    // An older body is clipped as written
    expect(recapBody(`- Goal: a\n- Done: b\n- Outcome: ${"y".repeat(800)}`)).toEndWith("y…");
  });
});

describe("buildRecapPrompt", () => {
  const input = (count: number, body: string | null): RecapInput => ({
    projectName: "app",
    from: 0,
    to: 7 * 86_400_000,
    sections: Array.from({ length: count }, (_, i) => ({
      start: i * 60_000,
      end: i * 60_000 + 30_000,
      headline: `Work ${i}`,
      body,
    })),
    prs: [],
    commits: [],
    ledger: { open: [], settled: [] },
  });
  const body = (done: string) => `- Goal: g\n- Done:\n  - ${done}\n- Open:\n  - [todo] left`;
  const full = body("done it");

  test("falls back from whole bodies to where each stood, then to headlines, then cuts", () => {
    expect(buildRecapPrompt(input(2, full))).toContain("Goal: g");
    const busy = buildRecapPrompt(input(300, body("x".repeat(200))));
    expect(busy).not.toContain("Goal: g");
    expect(busy).toContain("Open: [todo] left");
    expect(buildRecapPrompt(input(1000, full))).not.toContain("Open: [todo] left");
    const huge = buildRecapPrompt(input(3000, null));
    expect(huge).toContain("… (omitted) …");
    expect(huge.length).toBeLessThan(RECAP_LIMIT + 200);
  });
});

describe("parseRecap", () => {
  test("drops a heading or a code fence the model added", () => {
    expect(parseRecap("# Recap\n\nDid things.")).toBe("Did things.");
    expect(parseRecap("```markdown\nDid things.\n```")).toBe("Did things.");
    expect(parseRecap("  \n")).toBeNull();
  });
});
