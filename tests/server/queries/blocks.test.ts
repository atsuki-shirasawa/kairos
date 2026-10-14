import { describe, expect, test } from "bun:test";
import {
  type BlockFacts,
  type SectionRow,
  toCalendarSegment,
  toSection,
} from "../../../src/server/queries/blocks.ts";
import type { Activity } from "../../../src/shared/api.ts";

const activity: Activity = {
  commits: 1,
  prs: 0,
  merges: 0,
  filesEdited: 2,
  toolCalls: 3,
  subagents: 0,
  toolErrors: 0,
  interrupts: 0,
  apiErrors: 0,
  compactions: 0,
  claudeMs: null,
  effort: null,
};
const facts: BlockFacts = { usage: null, activity };
const noArtifacts = { prs: [], commits: [] };
const noState = { pending: false, error: null, closes: [] };

const row = (over: Partial<SectionRow> = {}): SectionRow => ({
  start: 1000,
  end: 2000,
  prompt_count: 2,
  fallback_title: null,
  headline: null,
  body: null,
  model: null,
  covered_until: null,
  created_at: null,
  ...over,
});

describe("a block's calendar segment and drawer section agree", () => {
  test.each<[string, Partial<SectionRow>]>([
    ["unsummarized, titled by the session", {}],
    ["unsummarized, titled by the block", { fallback_title: "Block" }],
    ["summarized", { headline: "Head", body: "Body", fallback_title: "Block" }],
    ["headline only", { headline: "Head", body: "" }],
  ])("%s", (_, over) => {
    const g = row(over);
    const segment = toCalendarSegment(g, "Session", noArtifacts, facts);
    const section = toSection(g, "Session", noState, facts);
    for (const key of [
      "start",
      "end",
      "promptCount",
      "headline",
      "body",
      "usage",
      "activity",
    ] as const)
      expect(segment[key]).toEqual(section[key]);
  });
});

test("a segment is summarized once it has a headline", () => {
  expect(toCalendarSegment(row(), "S", noArtifacts, facts).summarized).toBe(false);
  expect(toCalendarSegment(row({ headline: "H" }), "S", noArtifacts, facts).summarized).toBe(true);
});

test("a section is stale when the block went on after its summary", () => {
  expect(toSection(row({ covered_until: 1500 }), "S", noState, facts).stale).toBe(true);
  expect(toSection(row({ covered_until: 2000 }), "S", noState, facts).stale).toBe(false);
  expect(toSection(row(), "S", noState, facts).stale).toBe(false);
});
