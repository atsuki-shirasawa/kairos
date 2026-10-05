import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNewLines } from "../../../src/server/ingest/reader.ts";

function tmpFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "kairos-reader-")), "log.jsonl");
  writeFileSync(path, content);
  return path;
}

describe("readNewLines", () => {
  test("returns only complete lines; the next offset is the start of the partial line", () => {
    const path = tmpFile('{"a":1}\n{"b":2}\n{"c":');
    const res = readNewLines(path, 0, null);
    expect(res.lines.map((l) => l.text)).toEqual(['{"a":1}', '{"b":2}']);
    expect(res.nextOffset).toBe(16);
  });

  test("reads only what was appended", () => {
    const path = tmpFile('{"a":1}\n{"c":');
    const first = readNewLines(path, 0, null);
    appendFileSync(path, '3}\n{"d":4}\n');
    const second = readNewLines(path, first.nextOffset, first.ino);
    expect(second.lines.map((l) => l.text)).toEqual(['{"c":3}', '{"d":4}']);
    expect(second.lines[0]?.offset).toBe(8);
    expect(second.restarted).toBe(false);
  });

  test("offset counts bytes and stays correct with multibyte characters", () => {
    const path = tmpFile('{"t":"日本語"}\n{"t":"続き"}\n');
    const res = readNewLines(path, 0, null);
    expect(res.lines[1]?.offset).toBe(Buffer.byteLength('{"t":"日本語"}\n'));
    expect(readNewLines(path, res.lines[1]?.offset ?? 0, res.ino).lines[0]?.text).toBe(
      '{"t":"続き"}',
    );
  });

  test("re-reads from the start when the file shrinks", () => {
    const path = tmpFile('{"a":1}\n{"b":2}\n');
    const first = readNewLines(path, 0, null);
    writeFileSync(path, '{"x":9}\n');
    const res = readNewLines(path, first.nextOffset, first.ino);
    expect(res.restarted).toBe(true);
    expect(res.lines.map((l) => l.text)).toEqual(['{"x":9}']);
  });

  test("re-reads from the start when the file is replaced (inode changes)", () => {
    const path = tmpFile('{"a":1}\n');
    const first = readNewLines(path, 0, null);
    const other = tmpFile('{"a":1}\n{"b":2}\n');
    renameSync(other, path);
    const res = readNewLines(path, first.nextOffset, first.ino);
    expect(res.restarted).toBe(true);
    expect(res.lines).toHaveLength(2);
  });

  test("skips blank lines", () => {
    const path = tmpFile('{"a":1}\n\n{"b":2}\n');
    expect(readNewLines(path, 0, null).lines).toHaveLength(2);
  });
});
