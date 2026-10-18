import { describe, expect, test } from "bun:test";
import {
  type BlockOutput,
  blockRefs,
  commandRefs,
  requestRefs,
} from "../../../src/server/ingest/prRefs.ts";
import type { ActivityRow } from "../../../src/server/ingest/statements.ts";

const REPO = "github.com/me/app";

/** An activity row at `ts`. */
const row = (ts: number, kind: string, over: Partial<ActivityRow> = {}): ActivityRow => ({
  ts,
  kind,
  text: null,
  is_scheduled: 0,
  tool_name: null,
  input: null,
  ...over,
});
/** A Bash call at `ts`, its input stored as JSON. */
const bash = (ts: number, command: string) =>
  row(ts, "tool_use", { tool_name: "Bash", input: JSON.stringify({ command }) });

describe("requestRefs", () => {
  test("a PR URL works on that repository's PR, a bare #N mentions this one's", () => {
    expect(requestRefs("see https://github.com/acme/web/pull/7 and #3", REPO)).toEqual([
      { repo: "github.com/acme/web", number: 7, how: "worked" },
      { repo: REPO, number: 3, how: "mentioned" },
    ]);
  });

  test("issue URLs and URLs without a scheme aren't read as this repository's #N", () => {
    expect(
      requestRefs("https://github.com/other/lib/issues/5 github.com/acme/web/pull/7", REPO),
    ).toEqual([]);
  });

  test("without the session's repository only URLs say which PR", () => {
    expect(requestRefs("#6 and https://github.com/acme/web/pull/7", null)).toEqual([
      { repo: "github.com/acme/web", number: 7, how: "worked" },
    ]);
  });
});

describe("commandRefs", () => {
  test("a gh pr call works on the PR, wherever its number stands, and #N mentions", () => {
    expect(commandRefs("gh pr view --comments 12 && echo '#3'", REPO)).toEqual([
      { repo: REPO, number: 12, how: "worked" },
      { repo: REPO, number: 3, how: "mentioned" },
    ]);
  });

  test("--repo names the repository, on the session repository's host", () => {
    expect(commandRefs("gh pr checks 12 --repo acme/other", REPO)).toEqual([
      { repo: "github.com/acme/other", number: 12, how: "worked" },
    ]);
    expect(commandRefs("gh -R acme/other pr view 4", null)).toEqual([
      { repo: "github.com/acme/other", number: 4, how: "worked" },
    ]);
  });
});

describe("blockRefs", () => {
  const blocks = [
    { id: 1, start: 0, end: 100 },
    { id: 2, start: 200, end: 300 },
  ];

  test("gives each block what its requests and Bash calls name, and its outputs", () => {
    const activity = [
      row(10, "prompt", { text: "fix #4" }),
      bash(20, "gh pr create --fill"),
      row(30, "assistant", { text: "#9 is unrelated" }),
      row(150, "prompt", { text: "#8 between blocks" }),
      bash(210, "gh pr merge 5 --squash"),
    ];
    const outputs: BlockOutput[] = [
      { blockId: 2, kind: "merge", ref: "#5", title: null, ts: 210 },
      { blockId: 1, kind: "pr", ref: "https://github.com/me/app/pull/5", title: "feat: x", ts: 25 },
    ];
    expect(blockRefs(blocks, activity, outputs, REPO)).toEqual([
      { blockId: 1, repo: REPO, number: 4, how: "mentioned", ts: null, title: null },
      { blockId: 2, repo: REPO, number: 5, how: "worked", ts: null, title: null },
      { blockId: 1, repo: REPO, number: 5, how: "opened", ts: 25, title: "feat: x" },
      { blockId: 2, repo: REPO, number: 5, how: "merged", ts: 210, title: null },
    ]);
  });

  test("keeps the earliest open, without the pr-link stand-in title, and no merge of a branch", () => {
    const url = "https://github.com/me/app/pull/5";
    const outputs: BlockOutput[] = [
      { blockId: 1, kind: "pr", ref: url, title: "#5 me/app", ts: 30 },
      { blockId: 1, kind: "pr", ref: url, title: "#5", ts: 20 },
      { blockId: 2, kind: "merge", ref: "call:toolu_1", title: null, ts: 210 },
    ];
    expect(blockRefs(blocks, [], outputs, REPO)).toEqual([
      { blockId: 1, repo: REPO, number: 5, how: "opened", ts: 20, title: null },
    ]);
  });

  test("names each number once per block and way", () => {
    const activity = [row(10, "prompt", { text: "#4" }), row(20, "prompt", { text: "#4 again" })];
    expect(blockRefs(blocks, activity, [], REPO)).toHaveLength(1);
  });
});
