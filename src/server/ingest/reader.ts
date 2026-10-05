import { closeSync, openSync, readSync, statSync } from "node:fs";

export interface Line {
  /** 行頭のバイト位置。メッセージの並び順に使う。 */
  offset: number;
  text: string;
}

export interface ReadResult {
  lines: Line[];
  /** 次回読み始める位置。改行で終わっていない最後の行（書き込み途中）の先頭を指す。 */
  nextOffset: number;
  size: number;
  ino: number;
  /** ファイルが置き換えられた・切り詰められたため、先頭から読み直した。 */
  restarted: boolean;
}

const NEWLINE = 0x0a;
const CHUNK = 4 * 1024 * 1024;
const decoder = new TextDecoder();

/**
 * `offset` 以降の完全な行を読む。
 * offset はバイト単位で数えるので、行を UTF-8 として解釈する前に改行で区切る。
 */
export function readNewLines(path: string, offset: number, prevIno: number | null): ReadResult {
  const st = statSync(path);
  const restarted = (prevIno !== null && st.ino !== prevIno) || st.size < offset;
  let pos = restarted ? 0 : offset;
  const lines: Line[] = [];
  if (pos >= st.size) return { lines, nextOffset: pos, size: st.size, ino: st.ino, restarted };

  const fd = openSync(path, "r");
  try {
    let carry = new Uint8Array(0);
    let carryStart = pos;
    while (pos < st.size) {
      const buf = new Uint8Array(Math.min(CHUNK, st.size - pos));
      const n = readSync(fd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      pos += n;
      const data = carry.length ? concat(carry, buf.subarray(0, n)) : buf.subarray(0, n);
      let start = 0;
      for (let i = data.indexOf(NEWLINE); i !== -1; i = data.indexOf(NEWLINE, start)) {
        if (i > start)
          lines.push({ offset: carryStart + start, text: decoder.decode(data.subarray(start, i)) });
        start = i + 1;
      }
      carry = data.slice(start);
      carryStart += start;
    }
    return { lines, nextOffset: carryStart, size: st.size, ino: st.ino, restarted };
  } finally {
    closeSync(fd);
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
