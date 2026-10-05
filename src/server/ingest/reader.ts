import { closeSync, openSync, readSync, statSync } from "node:fs";

export interface Line {
  /** Byte offset of the line start. Used to order messages. */
  offset: number;
  text: string;
}

export interface ReadResult {
  lines: Line[];
  /** Where to start reading next time: the start of a trailing line without a newline (still being written). */
  nextOffset: number;
  size: number;
  ino: number;
  /** The file was replaced or truncated, so it was read again from the start. */
  restarted: boolean;
}

const NEWLINE = 0x0a;
const CHUNK = 4 * 1024 * 1024;
const decoder = new TextDecoder();

/**
 * Reads the complete lines after `offset`.
 * offset counts bytes, so split on newlines before decoding lines as UTF-8.
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
