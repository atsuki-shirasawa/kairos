import { describe, expect, test } from "bun:test";
import { commandOf, loadTaskCalls, loadToolCalls, toolInput } from "../../src/server/toolCalls.ts";
import { call } from "./calls.ts";
import { setup } from "./ingest/helpers.ts";

describe("toolInput", () => {
  test("reads an object input, and nothing from a cut-short or non-object one", () => {
    expect(toolInput({ input: '{"a":1}' })).toEqual({ a: 1 });
    expect(toolInput({ input: '{"a":' })).toBeNull();
    expect(toolInput({ input: "[1]" })).toBeNull();
    expect(toolInput({ input: null })).toBeNull();
  });
});

describe("commandOf", () => {
  test("prefers the full command from the input over the stored one-line summary", () => {
    const c = call({ toolName: "Bash", text: "bun", input: '{"command":"bun test"}' });
    expect(commandOf(c)).toBe("bun test");
    expect(commandOf({ ...c, input: '{"command":' })).toBe("bun");
  });
});

describe("loadToolCalls / loadTaskCalls", () => {
  test("load only task calls from the session's start, and any calls in a range", () => {
    const { db, ingester } = setup();
    ingester.scan();
    const session = db
      .query<{ session_id: string; end: number }, []>(
        `SELECT session_id, MAX(ts) AS end FROM messages
         WHERE tool_name = 'TaskCreate' GROUP BY session_id LIMIT 1`,
      )
      .get();
    if (!session) throw new Error("fixture has no task calls");
    const tasks = loadTaskCalls(db, session.session_id, session.end);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((c) => c.toolName === "TaskCreate" || c.toolName === "TaskUpdate")).toBe(
      true,
    );
    const all = loadToolCalls(db, session.session_id, 0, session.end);
    expect(all.length).toBeGreaterThanOrEqual(tasks.length);
  });
});
