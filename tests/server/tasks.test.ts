import { describe, expect, test } from "bun:test";
import { completedTask, taskStates } from "../../src/server/tasks.ts";
import { call, taskCreate as create, taskUpdate as update } from "./calls.ts";

describe("taskStates", () => {
  test("replays creates and updates, reading both key spellings", () => {
    const tasks = taskStates(
      [
        create("A", "1"),
        create("B", "2"),
        update({ taskId: "1", status: "completed" }),
        update({ task_id: "2", state: "in_progress" }),
      ],
      0,
    );
    expect(tasks.map((t) => [t.id, t.subject, t.status])).toEqual([
      ["1", "A", "completed"],
      ["2", "B", "in_progress"],
    ]);
  });

  test("marks which tasks the section touched and drops deleted ones", () => {
    const tasks = taskStates(
      [
        create("old", "1", 10),
        create("gone", "2", 10),
        update({ taskId: "2", status: "deleted" }, 60),
      ],
      50,
    );
    expect(tasks).toEqual([{ id: "1", subject: "old", status: "pending", touched: false }]);
  });

  test("ignores a create that failed and an update to an unknown task", () => {
    const failed = { ...create("x", "1"), isError: true };
    expect(taskStates([failed, update({ taskId: "9", status: "completed" })], 0)).toEqual([]);
  });
});

describe("completedTask", () => {
  test("reads the task a TaskUpdate completed, under either key spelling", () => {
    expect(completedTask(update({ taskId: "3", status: "completed" }))).toBe("3");
    expect(completedTask(update({ task_id: "4", state: "completed" }))).toBe("4");
  });

  test("is null for other statuses, failed updates and other tools", () => {
    expect(completedTask(update({ taskId: "3", status: "in_progress" }))).toBeNull();
    expect(completedTask({ ...update({ taskId: "3", status: "completed" }), isError: true })).toBe(
      null,
    );
    expect(completedTask(call({ toolName: "Bash", input: '{"status":"completed"}' }))).toBeNull();
  });
});
