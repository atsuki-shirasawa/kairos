// Tool calls built by hand for the tests of the modules that read them.
import type { ToolCall } from "../../src/server/toolCalls.ts";

/** A successful call at time 0 with no input or result, overridden by `c`. */
export const call = (c: Partial<ToolCall> & Pick<ToolCall, "toolName">): ToolCall => ({
  ts: 0,
  text: "",
  input: null,
  result: null,
  isError: false,
  ...c,
});

/** A Bash call running `command`, with its output. */
export const bash = (command: string, result: string, isError = false, ts = 0): ToolCall =>
  call({
    toolName: "Bash",
    text: command,
    input: JSON.stringify({ command }),
    result,
    isError,
    ts,
  });

/** A TaskCreate call that created task `id`. */
export const taskCreate = (subject: string, id: string, ts = 0): ToolCall =>
  call({
    toolName: "TaskCreate",
    ts,
    input: JSON.stringify({ subject, description: "d" }),
    result: `Task #${id} created successfully: ${subject}`,
  });

/** A TaskUpdate call with the given input. */
export const taskUpdate = (input: object, ts = 0): ToolCall =>
  call({ toolName: "TaskUpdate", ts, input: JSON.stringify(input), result: "Updated task" });
