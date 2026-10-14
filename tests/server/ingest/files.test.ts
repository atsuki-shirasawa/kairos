import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { classifyPath, listFiles, subagentFiles } from "../../../src/server/ingest/files.ts";

test("classifyPath", () => {
  const p = "/x/projects";
  expect(classifyPath(p, `${p}/-a/s1.jsonl`)).toEqual({ kind: "session", sessionId: "s1" });
  expect(classifyPath(p, `${p}/-a/s1/subagents/agent-ab12.jsonl`)).toEqual({
    kind: "subagent",
    sessionId: "s1",
    agentId: "ab12",
  });
  expect(classifyPath(p, `${p}/-a/s1/subagents/agent-ab12.meta.json`)).toEqual({
    kind: "subagent-meta",
    sessionId: "s1",
    agentId: "ab12",
  });
  expect(classifyPath(p, `${p}/-a/memory/notes.md`)).toBeNull();
});

/** Creates empty files at the given paths under a new temporary directory, returning the root. */
function tree(paths: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "kairos-files-"));
  for (const p of paths) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), "");
  }
  return root;
}

test("listFiles puts main session files first, then subagent files, each sorted", () => {
  const root = tree([
    "-b/s2.jsonl",
    "-a/s1.jsonl",
    "-a/s1/subagents/agent-x.jsonl",
    "-a/s1/subagents/agent-x.meta.json",
    "-a/s1/subagents/notes.txt",
    "-a/memory/notes.md",
    "stray.jsonl",
  ]);
  expect(listFiles(root).map((f) => f.slice(root.length + 1))).toEqual([
    "-a/s1.jsonl",
    "-b/s2.jsonl",
    "-a/s1/subagents/agent-x.jsonl",
    "-a/s1/subagents/agent-x.meta.json",
  ]);
});

test("listFiles is empty when the projects directory does not exist", () => {
  expect(listFiles(join(tmpdir(), "kairos-files-missing", "projects"))).toEqual([]);
});

test("subagentFiles is empty for a session directory without subagents", () => {
  const root = tree(["-a/s1/other.jsonl"]);
  expect(subagentFiles(join(root, "-a/s1"))).toEqual([]);
});
