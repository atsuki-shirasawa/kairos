import { expect, test } from "bun:test";
import {
  byClaudeDir,
  byHeldRepos,
  byScratchpadOwner,
  runLabel,
} from "../../../src/server/ingest/placement.ts";
import { encodeDir } from "../../../src/server/ingest/project.ts";

const PAD = "/private/tmp/claude-501/-Users-me-dev-app/0a1b/scratchpad";

test("runLabel names a run after its directory, except a scratchpad's root", () => {
  expect(runLabel("/tmp/loop-deny-probe")).toBe("loop-deny-probe");
  expect(runLabel(`${PAD}/permtest`)).toBe("permtest");
  expect(runLabel(PAD)).toBeNull();
});

test("byScratchpadOwner places a scratchpad with the project of the session that made it", () => {
  const dirs = new Map([[encodeDir("/Users/me/dev/app"), 7]]);
  expect(byScratchpadOwner(`${PAD}/permtest`, dirs)).toEqual({ id: 7, label: "permtest" });
  expect(byScratchpadOwner(PAD, dirs)).toEqual({ id: 7, label: null });
});

test("byScratchpadOwner is null for other paths and for owners not placed yet", () => {
  const dirs = new Map([[encodeDir("/Users/me/dev/app"), 7]]);
  expect(byScratchpadOwner("/tmp/loop-deny-probe", dirs)).toBeNull();
  expect(byScratchpadOwner(PAD, new Map())).toBeNull();
});

test("byClaudeDir places a log folder with its sessions' project and the rest of ~/.claude in none", () => {
  const dirs = new Map([[encodeDir("/Users/me/dev/app"), 7]]);
  expect(byClaudeDir("/Users/me/.claude/projects/-Users-me-dev-app", dirs)).toEqual({
    id: 7,
    label: null,
  });
  expect(byClaudeDir("/Users/me/.claude/projects/-Users-me-dev-gone", dirs)).toEqual({
    id: null,
    label: null,
  });
  expect(byClaudeDir("/Users/me/.claude", dirs)).toEqual({ id: null, label: null });
  expect(byClaudeDir("/Users/me/dev/app", dirs)).toBeNull();
  expect(byClaudeDir("/Users/me/dev/claude-tools", dirs)).toBeNull();
});

test("byHeldRepos places a directory that holds a repository's clone in none", () => {
  const own = (path: string) => ({ path, name: "x", label: null, repo: null });
  const repos = ["/Users/me/dev/app", "/srv/clone"];
  for (const path of ["/Users/me", "/Users/me/dev", "/srv"])
    expect(byHeldRepos(own(path), repos)).toEqual({ id: null, label: null });
  // The repository itself, a sibling sharing a prefix, and an unrelated folder
  for (const path of ["/Users/me/dev/app", "/Users/me/dev/ap", "/Users/me/notes"])
    expect(byHeldRepos(own(path), repos)).toBeNull();
});
