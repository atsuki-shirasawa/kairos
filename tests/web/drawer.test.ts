import { describe, expect, test } from "bun:test";
import type { Activity, Artifact, Section, Subagent, Usage } from "../../src/shared/api.ts";
import type { SummaryParts } from "../../src/shared/summaryBody.ts";
import {
  flowWindow,
  ranDuring,
  selectedSection,
  spansDays,
  splitOutcomes,
  splitSubagents,
  summaryOutcomeNode,
  usageShown,
} from "../../src/web/src/lib/drawer.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 00:00
const H = 3_600_000;
/** The grace the server gives a section for outputs recorded after its end. */
const GRACE = 300_000;

const section = (start: number, end = start + H): Section => ({
  start,
  end,
  outputsUntil: end + GRACE,
  promptCount: 1,
  headline: "",
  short: null,
  body: null,
  model: null,
  createdAt: null,
  stale: false,
  summarizable: true,
  pending: false,
  error: null,
  usage: null,
  activity: {} as Activity,
  closes: [],
  opens: [],
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
  name: null,
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
  test("keeps outcomes up to the section's outputsUntil, as the server cut it", () => {
    const s = { ...section(DAY0, DAY0 + H), outputsUntil: DAY0 + H + 60_000 };
    const { here, rest } = splitOutcomes(
      [],
      [artifact(DAY0 + H + 60_000), artifact(DAY0 + H + 60_001)],
      s,
    );
    expect(here.map((a) => a.ts)).toEqual([DAY0 + H + 60_000]);
    expect(rest.map((a) => a.ts)).toEqual([DAY0 + H + 60_001]);
  });

  test("keeps outcomes within the grace period in the section, in time order", () => {
    const s = section(DAY0, DAY0 + H);
    const late = artifact(DAY0 + H + GRACE);
    const tooLate = artifact(DAY0 + H + GRACE + 1);
    const pr = artifact(DAY0 + 10, "pr");
    const undated = artifact(null);
    const { here, rest } = splitOutcomes([pr], [late, tooLate, undated], s);
    expect(here).toEqual([pr, late]);
    expect(rest).toEqual([tooLate, undated]);
  });

  test("orders by time across PRs and commits, PRs first on a tie", () => {
    const s = section(DAY0, DAY0 + H);
    const early = artifact(DAY0 + 10);
    const pr = artifact(DAY0 + 20, "pr");
    const tie = artifact(DAY0 + 20);
    expect(splitOutcomes([pr], [tie, early], s).here).toEqual([early, pr, tie]);
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

describe("usageShown", () => {
  const usage = (tokens: number) => ({ tokens }) as Usage;

  test("the selected section's usage, even when it has none", () => {
    expect(usageShown({ usage: usage(9) }, { ...section(DAY0), usage: usage(3) })?.tokens).toBe(3);
    expect(usageShown({ usage: usage(9) }, section(DAY0))).toBeNull();
  });

  test("the session's usage without a selection", () => {
    expect(usageShown({ usage: usage(9) }, null)?.tokens).toBe(9);
  });
});

describe("summaryOutcomeNode", () => {
  const s = section(DAY0, DAY0 + H);
  const pr: Artifact = { kind: "pr", ref: "https://github.com/o/r/pull/30", title: null, ts: DAY0 };
  const commit: Artifact = { kind: "commit", ref: "2023692abcdef", title: "fix", ts: DAY0 };
  const parts = (outcome: string | null, resolved: string[] = []): SummaryParts => ({
    goal: "g",
    done: ["d"],
    resolved,
    open: [],
    next: null,
    outcome,
  });

  test("reads an older body's Outcome", () => {
    expect(summaryOutcomeNode(parts("Merged #30"), { prs: [pr], commits: [] }, s)).toBe("pr");
  });

  test("reads the Resolved points when there is no Outcome", () => {
    const p = parts(null, ["Tests pass", "main is at 2023692"]);
    expect(summaryOutcomeNode(p, { prs: [], commits: [commit] }, s)).toBe("commit");
  });

  test("ignores PRs and commits made outside the section", () => {
    const later = { ...pr, ts: DAY0 + 5 * H };
    expect(summaryOutcomeNode(parts("Merged #30"), { prs: [later], commits: [] }, s)).toBeNull();
  });
});
