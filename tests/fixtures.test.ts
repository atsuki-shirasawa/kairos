// fixture 自体の健全性チェック。取り込み処理（P1）の前提が崩れていないことを確かめる。
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
  test("partial 以外の全ファイルは、すべての行が JSON として読める", () => {
    for (const file of sessionFiles()) {
      if (file.includes(SID.partial)) continue;
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("partial の最終行は改行なしで途切れている", () => {
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
    ["continuedTo（コピーと重複を除く前）", SID.continuedTo, 2],
  ])("%s の人の発言数が README の前提と合う", (_name, sid, count) => {
    expect(humanUtterances(sid)).toBe(count);
  });

  test("loop の自動実行は 4 回", () => {
    expect(records(SID.loop).filter((r) => r.turnOrigin === "scheduled")).toHaveLength(4);
  });

  test("continuedTo の先頭には前のセッションのレコードがコピーされている", () => {
    const first = records(SID.continuedTo).find((r) => r.type === "user");
    expect(first?.sessionId).toBe(SID.continuedFrom);
  });

  test("生成は決定的（2 回生成しても同じ内容になる）", () => {
    const snapshot = () =>
      sessionFiles()
        .map((f) => readFileSync(f, "utf8"))
        .join("\n");
    const before = snapshot();
    Bun.spawnSync(["bun", join(import.meta.dir, "fixtures/generate.ts")]);
    expect(snapshot()).toBe(before);
  });
});
