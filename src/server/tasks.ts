// Claude Code's task list, replayed from TaskCreate / TaskUpdate calls. Shared by the summaries
// (facts and the open-items ledger) and the live page's task progress.
import { oneLine } from "./text.ts";
import { stringField, type ToolCall, toolInput } from "./toolCalls.ts";

const TASK_CREATED_RE = /Task #(\S+) created/;

/** A task's state at the end of the replayed calls. */
export interface TaskState {
  id: string;
  subject: string;
  status: string;
  /** Whether a call at or after the replay's `since` created or updated it. */
  touched: boolean;
}

/** The task ID a TaskUpdate names; updates have used both `taskId` and `task_id`. */
function updatedTaskId(input: Record<string, unknown> | null): string | null {
  return stringField(input?.taskId) ?? stringField(input?.task_id);
}

/** The status a TaskUpdate sets; updates have used both `status` and `state`. */
function updatedStatus(input: Record<string, unknown> | null): string | null {
  return stringField(input?.status) ?? stringField(input?.state);
}

/**
 * Each task's subject and latest status, replaying TaskCreate / TaskUpdate in order. The task ID
 * comes from TaskCreate's result ("Task #3 created…"). A task counts as touched when a call at or
 * after `since` (a section's start) created or updated it.
 */
export function taskStates(calls: ToolCall[], since: number): TaskState[] {
  const tasks = new Map<string, TaskState>();
  for (const c of calls) {
    const input = toolInput(c);
    const touched = c.ts >= since;
    if (c.toolName === "TaskCreate") {
      const id = TASK_CREATED_RE.exec(c.result ?? "")?.[1];
      if (!id || c.isError) continue;
      tasks.set(id, {
        id,
        subject: oneLine(stringField(input?.subject) ?? c.text),
        status: "pending",
        touched,
      });
    } else if (c.toolName === "TaskUpdate" && !c.isError) {
      const id = updatedTaskId(input);
      const task = id ? tasks.get(id) : undefined;
      if (!task) continue;
      task.status = updatedStatus(input) ?? task.status;
      task.subject = oneLine(stringField(input?.subject) ?? task.subject);
      task.touched ||= touched;
    }
  }
  return [...tasks.values()].filter((t) => t.status !== "deleted");
}

/** ID of the task a successful TaskUpdate call marked completed, or null for any other call. */
export function completedTask(c: ToolCall): string | null {
  if (c.toolName !== "TaskUpdate" || c.isError) return null;
  const input = toolInput(c);
  return updatedStatus(input) === "completed" ? updatedTaskId(input) : null;
}
