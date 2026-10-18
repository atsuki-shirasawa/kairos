import { describe, expect, test } from "bun:test";
import type { ActivityRow } from "../../../src/server/ingest/statements.ts";
import {
  joinFragments,
  rowTopic,
  sharesTopic,
  splitByTopic,
} from "../../../src/server/ingest/topics.ts";

const m = 60_000;

/** A row at `min` minutes. */
const at = (min: number, kind: string, extra: Partial<ActivityRow> = {}): ActivityRow => ({
  ts: min * m,
  kind,
  text: null,
  is_scheduled: 0,
  tool_name: null,
  input: null,
  ...extra,
});
/** A prompt at `min` minutes. */
const prompt = (min: number, text = "go on") => at(min, "prompt", { text });
/** A Bash call at `min` minutes. */
const bash = (min: number, command: string) =>
  at(min, "tool_use", { tool_name: "Bash", input: JSON.stringify({ command }) });
/** An Edit call at `min` minutes; `activity` loads an edit tool's path as its input. */
const edit = (min: number, path: string) => at(min, "tool_use", { tool_name: "Edit", input: path });

/** The keys a row's topic has, sorted. */
const keys = (row: ActivityRow) => [...rowTopic(row).keys].sort();

describe("rowTopic", () => {
  test("reads issue and PR numbers from prompts, gh calls and URLs", () => {
    expect(keys(prompt(0, "let's do #42 next"))).toEqual(["#42"]);
    expect(keys(bash(0, "gh issue view 42 --json body"))).toEqual(["#42"]);
    expect(keys(bash(0, "gh pr merge 7 --squash"))).toEqual(["#7"]);
    expect(keys(bash(0, "open https://github.com/acme/app/pull/9"))).toEqual(["#9"]);
  });

  test("reads a commit body's Closes line, which is past the summary's first line", () => {
    expect(keys(bash(0, "git commit -q -F - <<EOF\nfeat: x\n\nCloses #12\nEOF"))).toEqual(["#12"]);
  });

  test("reads branches switched to, but not the shared ones or option words", () => {
    expect(keys(bash(0, "git switch -c feat/search"))).toEqual(["br:feat/search"]);
    expect(keys(bash(0, "git checkout -b fix/x && git switch main"))).toEqual(["br:fix/x"]);
    expect(keys(bash(0, "git switch -q main"))).toEqual([]);
    // Restoring a path, or a remote branch, isn't a topic
    expect(keys(bash(0, "git checkout src/a.ts && git switch origin/feat"))).toEqual([]);
  });

  test("reads worktrees from paths, commands and EnterWorktree", () => {
    expect(keys(edit(0, "/repo/.claude/worktrees/alpha/src/a.ts"))).toEqual(["wt:alpha"]);
    expect(keys(bash(0, "cd /repo/.claude/worktrees/beta && ls"))).toEqual(["wt:beta"]);
    const enter = at(0, "tool_use", {
      tool_name: "EnterWorktree",
      input: JSON.stringify({ name: "gamma" }),
    });
    expect(keys(enter)).toEqual(["wt:gamma"]);
  });

  test("counts edited files, leaving out scratch files", () => {
    expect([...rowTopic(edit(0, "/repo/src/a.ts")).files]).toEqual(["/repo/src/a.ts"]);
    expect(rowTopic(edit(0, "/tmp/body.md")).files.size).toBe(0);
    expect(rowTopic(edit(0, "/x/scratchpad/notes.md")).files.size).toBe(0);
  });

  test("reads a Bash input clipped mid-JSON, as long commands are stored", () => {
    const clipped = `{"command": "git commit -F - <<EOF\\nfix: y\\n\\nCloses #31\\n${"x".repeat(50)}… (900 more characters)`;
    expect(keys(at(0, "tool_use", { tool_name: "Bash", input: clipped }))).toEqual(["#31"]);
  });

  test("reads Jira keys, and ignores a # that isn't a ref", () => {
    expect(keys(prompt(0, "APP-31 next"))).toEqual(["APP-31"]);
    expect(keys(prompt(0, "see the README#42 anchor and &#39;"))).toEqual([]);
  });
});

test("sharesTopic is true for a shared key or a shared file", () => {
  const a = { keys: new Set(["#1"]), files: new Set(["/a"]) };
  expect(sharesTopic(a, { keys: new Set(["#1"]), files: new Set() })).toBe(true);
  expect(sharesTopic(a, { keys: new Set(["#2"]), files: new Set(["/a"]) })).toBe(true);
  expect(sharesTopic(a, { keys: new Set(["#2"]), files: new Set(["/b"]) })).toBe(false);
});

/** Two topics back to back over two hours, each with a few prompts. */
const twoTopics = [
  prompt(0, "work on #1"),
  edit(5, "/repo/a.ts"),
  prompt(20, "and the tests"),
  bash(40, "gh pr merge 1"),
  prompt(60, "now #2"),
  edit(70, "/repo/b.ts"),
  prompt(90, "go on"),
  prompt(110, "done?"),
];

describe("splitByTopic", () => {
  test("splits a long block where a turn names only something new", () => {
    const parts = splitByTopic(twoTopics);
    expect(parts.map((p) => [p[0]?.ts, p.at(-1)?.ts])).toEqual([
      [0, 40 * m],
      [60 * m, 110 * m],
    ]);
  });

  test("keeps a block up to an hour whole", () => {
    const short = twoTopics.filter((r) => r.ts <= 60 * m);
    expect(splitByTopic(short)).toHaveLength(1);
  });

  test("doesn't split on a turn that shares a file with the part so far", () => {
    const rows = twoTopics.map((r) => (r.ts === 70 * m ? edit(70, "/repo/a.ts") : r));
    expect(splitByTopic(rows)).toHaveLength(1);
  });

  test("a turn that names nothing stays with the part before it", () => {
    const rows = [prompt(0, "#1"), prompt(30, "what next?"), prompt(50, "ok"), prompt(80, "go")];
    expect(splitByTopic(rows)).toHaveLength(1);
  });

  test("folds a part shorter than the minimum into the one before", () => {
    const rows = [...twoTopics.slice(0, 4), prompt(55, "#3 quick"), ...twoTopics.slice(4)];
    const parts = splitByTopic(rows);
    expect(parts.map((p) => p[0]?.ts)).toEqual([0, 60 * m]);
    expect(parts[0]?.at(-1)?.ts).toBe(55 * m);
  });

  test("splits an automatic session too, counting its ticks as requests", () => {
    const tick = (min: number, text: string) => at(min, "scheduled", { text });
    const rows = [tick(0, "#1"), tick(20, "go"), tick(40, "go"), tick(60, "#2"), tick(80, "go")];
    expect(splitByTopic(rows)).toHaveLength(2);
  });

  test("ties the PR a turn opened to later turns that name it", () => {
    const rows = [
      prompt(0, "fix #5"),
      prompt(20, "open a PR"),
      prompt(45, "is #77 green?"),
      prompt(70, "merge it"),
    ];
    expect(splitByTopic(rows)).toHaveLength(2);
    const pr = { ts: 25 * m, ref: "https://github.com/acme/app/pull/77" };
    expect(splitByTopic(rows, [pr])).toHaveLength(1);
  });

  test("leaves out a PR opened before the block", () => {
    const rows = [prompt(0, "#5"), prompt(20, "more"), prompt(45, "#6 now"), prompt(70, "go")];
    const early = { ts: -60 * m, ref: "https://github.com/acme/app/pull/6" };
    expect(splitByTopic(rows, [early])).toHaveLength(2);
  });
});

describe("joinFragments", () => {
  const fragment = [prompt(0, "#4"), prompt(5, "more")];
  const later = [prompt(40, "#4 again"), prompt(70, "go")];

  test("joins a short block to the next one on the same topic after a pause", () => {
    expect(joinFragments([fragment, later])).toHaveLength(1);
  });

  test("keeps them apart on another topic, after a long pause, or when the first isn't short", () => {
    expect(joinFragments([fragment, [prompt(40, "#5")]])).toHaveLength(2);
    expect(joinFragments([fragment, [prompt(60, "#4")]])).toHaveLength(2);
    expect(joinFragments([[prompt(0, "#4"), prompt(30, "more")], [prompt(60, "#4")]])).toHaveLength(
      2,
    );
  });

  test("a short block after a long one stays apart however short it stays", () => {
    const long = [prompt(0, "#4"), prompt(30, "more")];
    expect(joinFragments([long, [prompt(40, "#4")]])).toHaveLength(2);
  });
});
