import { describe, expect, test } from "bun:test";
import type { Activity, Artifact, Section, Subagent } from "../../src/shared/api.ts";
import { ARTIFACT_GRACE_MS } from "../../src/shared/constants.ts";
import {
  approxCostLabel,
  flowWindow,
  prLinkParts,
  ranDuring,
  selectedSection,
  shortSha,
  spansDays,
  splitOutcomes,
  splitSubagents,
  summaryFailureKind,
} from "../../src/web/src/lib/drawer.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 00:00
const H = 3_600_000;

const section = (start: number, end = start + H): Section => ({
  start,
  end,
  promptCount: 1,
  headline: "",
  body: null,
  model: null,
  createdAt: null,
  stale: false,
  summarizable: true,
  pending: false,
  error: null,
  usage: null,
  activity: {} as Activity,
});

const sections = (n: number) => Array.from({ length: n }, (_, i) => section(DAY0 + i * H));

const artifact = (ts: number | null, kind: Artifact["kind"] = "commit"): Artifact => ({
  kind,
  ref: `ref-${ts}`,
  title: null,
  ts,
});

const subagent = (startedAt: number | null, endedAt: number | null): Subagent => ({
  id: `a-${startedAt}`,
  agentType: null,
  description: null,
  toolUseId: null,
  startedAt,
  endedAt,
});

describe("selectedSection", () => {
  test("picks the section starting at `at`, else the last one", () => {
    const xs = sections(3);
    expect(selectedSection(xs, xs[1]?.start ?? 0)).toBe(xs[1] ?? null);
    expect(selectedSection(xs, null)).toBe(xs[2] ?? null);
    expect(selectedSection(xs, 12345)).toBe(xs[2] ?? null);
    expect(selectedSection([], null)).toBeNull();
  });
});

describe("spansDays", () => {
  test("is true only when a section starts on another day than the first", () => {
    expect(spansDays(sections(3))).toBe(false);
    expect(spansDays([section(DAY0 + H), section(DAY0 + 25 * H)])).toBe(true);
    expect(spansDays([])).toBe(false);
  });
});

describe("flowWindow", () => {
  test("shows everything up to the limit or when expanded", () => {
    const xs = sections(6);
    expect(flowWindow(xs, xs[0] ?? null, 6, false)).toEqual({
      shown: xs,
      hiddenBefore: 0,
      hiddenAfter: 0,
    });
    const many = sections(10);
    expect(flowWindow(many, many[0] ?? null, 6, true).shown).toBe(many);
  });

  test("centres on the selected period", () => {
    const xs = sections(10);
    const w = flowWindow(xs, xs[5] ?? null, 6, false);
    expect(w.shown).toEqual(xs.slice(2, 8));
    expect([w.hiddenBefore, w.hiddenAfter]).toEqual([2, 2]);
  });

  test("clamps at both ends, and centres on the last period without a selection", () => {
    const xs = sections(10);
    expect(flowWindow(xs, xs[0] ?? null, 6, false)).toMatchObject({
      hiddenBefore: 0,
      hiddenAfter: 4,
    });
    expect(flowWindow(xs, null, 6, false)).toMatchObject({ hiddenBefore: 4, hiddenAfter: 0 });
  });
});

describe("splitOutcomes", () => {
  test("puts PRs first and keeps outcomes within the grace period in the section", () => {
    const s = section(DAY0, DAY0 + H);
    const late = artifact(DAY0 + H + ARTIFACT_GRACE_MS);
    const tooLate = artifact(DAY0 + H + ARTIFACT_GRACE_MS + 1);
    const pr = artifact(DAY0 + 10, "pr");
    const undated = artifact(null);
    const { here, rest } = splitOutcomes([pr], [late, tooLate, undated], s);
    expect(here).toEqual([pr, late]);
    expect(rest).toEqual([tooLate, undated]);
  });
});

describe("splitSubagents", () => {
  test("lists those overlapping the section as here", () => {
    const s = section(DAY0, DAY0 + H);
    const inside = subagent(DAY0 + 10, DAY0 + 20);
    const overlapping = subagent(DAY0 - 10, DAY0);
    const before = subagent(DAY0 - 20, DAY0 - 10);
    const unknown = subagent(null, null);
    expect(splitSubagents([inside, overlapping, before, unknown], s)).toEqual({
      here: [inside, overlapping],
      others: [before, unknown],
    });
  });

  test("without a section, none ran during it", () => {
    expect(ranDuring(subagent(DAY0, DAY0 + 1), null)).toBe(false);
  });
});

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

describe("approxCostLabel", () => {
  test("marks unpriced usage with ~", () => {
    const u = { costUsd: 1.5, unpriced: false } as Parameters<typeof approxCostLabel>[0];
    expect(approxCostLabel(u)).not.toStartWith("~");
    expect(approxCostLabel({ ...u, unpriced: true })).toStartWith("~");
  });
});

describe("summaryFailureKind", () => {
  test("classifies the server's failure messages", () => {
    expect(summaryFailureKind("Not logged in · Please run /login")).toBe("login");
    expect(summaryFailureKind("claude command not found")).toBe("noClaude");
    expect(summaryFailureKind("did not finish within 120s")).toBe("timeout");
    expect(summaryFailureKind("API Error: 529 overloaded")).toBe("rateLimit");
    expect(summaryFailureKind("something else")).toBe("other");
  });
});
