// Sanity checks of the fixtures themselves: the assumptions of ingest (P1) still hold.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SID } from "./fixtures/ids.ts";

const PROJECTS = join(import.meta.dir, "fixtures/claude/projects");

function sessionFiles(): string[] {
  return readdirSync(PROJECTS, { recursive: true, encoding: "utf8" })
    .filter((p) => p.endsWith(".jsonl") && !p.includes("/subagents/"))
    .map((p) => join(PROJECTS, p));
}

function records(sid: string): Record<string, unknown>[] {
  const file = sessionFiles().find((f) => f.endsWith(`${sid}.jsonl`));
  if (!file) throw new Error(`fixture not found: ${sid}`);
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.endsWith("}"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function humanUtterances(sid: string): number {
  return records(sid).filter(
    (r) =>
      r.type === "user" &&
      r.sessionId === sid &&
      (r.origin as { kind?: string } | undefined)?.kind === "human",
  ).length;
}

describe("fixtures", () => {
  test("every line of every file except partial parses as JSON", () => {
    for (const file of sessionFiles()) {
      if (file.includes(SID.partial)) continue;
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("the last line of partial is cut off without a newline", () => {
    const text = readFileSync(sessionFiles().find((f) => f.includes(SID.partial)) ?? "", "utf8");
    expect(text.endsWith("\n")).toBe(false);
    const last = text.split("\n").at(-1) ?? "";
    expect(() => JSON.parse(last)).toThrow();
  });

  test.each([
    ["basic", SID.basic, 3],
    ["loop", SID.loop, 2],
    ["headless", SID.headless, 0],
    ["compaction", SID.compaction, 3],
    ["continuedTo (before removing copies and duplicates)", SID.continuedTo, 3],
  ])("%s has the user prompt count assumed by the README", (_name, sid, count) => {
    expect(humanUtterances(sid)).toBe(count);
  });

  test("loop has 4 automatic runs", () => {
    expect(records(SID.loop).filter((r) => r.turnOrigin === "scheduled")).toHaveLength(4);
  });

  test("continuedTo starts with the previous session's conversation, copied with the same uuids and only sessionId changed", () => {
    const original = records(SID.continuedFrom).find((r) => r.type === "user");
    const copy = records(SID.continuedTo).find((r) => r.type === "user");
    expect(copy?.uuid).toBe(original?.uuid);
    expect(copy?.sessionId).toBe(SID.continuedTo);
  });

  test("generation is deterministic (two runs produce the same content)", () => {
    const snapshot = () =>
      sessionFiles()
        .map((f) => readFileSync(f, "utf8"))
        .join("\n");
    const before = snapshot();
    Bun.spawnSync(["bun", join(import.meta.dir, "fixtures/generate.ts")]);
    expect(snapshot()).toBe(before);
  });
});
