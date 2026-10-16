import { describe, expect, test } from "bun:test";
import { reopenHandler } from "../../src/web/src/lib/reconnect.ts";

describe("reopenHandler", () => {
  test("ignores the first open and reports every one after it", () => {
    let reconnects = 0;
    const onOpen = reopenHandler(() => reconnects++);
    onOpen();
    expect(reconnects).toBe(0);
    onOpen();
    onOpen();
    expect(reconnects).toBe(2);
  });
});
