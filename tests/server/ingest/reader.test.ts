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
  test("完全な行だけを返し、書きかけの行の先頭を次の offset にする", () => {
    const path = tmpFile('{"a":1}\n{"b":2}\n{"c":');
    const res = readNewLines(path, 0, null);
    expect(res.lines.map((l) => l.text)).toEqual(['{"a":1}', '{"b":2}']);
    expect(res.nextOffset).toBe(16);
  });

  test("追記分だけを読む", () => {
    const path = tmpFile('{"a":1}\n{"c":');
    const first = readNewLines(path, 0, null);
    appendFileSync(path, '3}\n{"d":4}\n');
    const second = readNewLines(path, first.nextOffset, first.ino);
    expect(second.lines.map((l) => l.text)).toEqual(['{"c":3}', '{"d":4}']);
    expect(second.lines[0]?.offset).toBe(8);
    expect(second.restarted).toBe(false);
  });

  test("offset はバイト単位で、マルチバイト文字があってもずれない", () => {
    const path = tmpFile('{"t":"日本語"}\n{"t":"続き"}\n');
    const res = readNewLines(path, 0, null);
    expect(res.lines[1]?.offset).toBe(Buffer.byteLength('{"t":"日本語"}\n'));
    expect(readNewLines(path, res.lines[1]?.offset ?? 0, res.ino).lines[0]?.text).toBe(
      '{"t":"続き"}',
    );
  });

  test("ファイルが短くなったら先頭から読み直す", () => {
    const path = tmpFile('{"a":1}\n{"b":2}\n');
    const first = readNewLines(path, 0, null);
    writeFileSync(path, '{"x":9}\n');
    const res = readNewLines(path, first.nextOffset, first.ino);
    expect(res.restarted).toBe(true);
    expect(res.lines.map((l) => l.text)).toEqual(['{"x":9}']);
  });

  test("ファイルが置き換えられたら（inode が変わったら）先頭から読み直す", () => {
    const path = tmpFile('{"a":1}\n');
    const first = readNewLines(path, 0, null);
    const other = tmpFile('{"a":1}\n{"b":2}\n');
    renameSync(other, path);
    const res = readNewLines(path, first.nextOffset, first.ino);
    expect(res.restarted).toBe(true);
    expect(res.lines).toHaveLength(2);
  });

  test("空行は飛ばす", () => {
    const path = tmpFile('{"a":1}\n\n{"b":2}\n');
    expect(readNewLines(path, 0, null).lines).toHaveLength(2);
  });
});
