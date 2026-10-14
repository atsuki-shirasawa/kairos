// The note the server stores when the log settles an open item (an issue closed, a PR merged, a
// task completed). It is stored in fixed English and the UI words it in its own language, so both
// sides build and read it here.

/** One thing the log showed: what happened, and to which reference (`#12`, or a task's `#3`). */
export type CloseNotePart =
  | { kind: "issueClosed" | "prMerged" | "taskCompleted"; ref: string }
  | { kind: "unknown"; text: string };

const SEPARATOR = "; ";

/** The phrase stored for an issue closed with `gh issue close`; `ref` is like `#12`. */
export function issueClosedNote(ref: string): string {
  return `closed ${ref}`;
}

/** The phrase stored for a merged PR; `ref` is like `#12`. */
export function prMergedNote(ref: string): string {
  return `merged PR ${ref}`;
}

/** The phrase stored for a completed task, by its ID within the session chain. */
export function taskCompletedNote(id: string): string {
  return `task #${id} completed`;
}

/** Joins the phrases of everything that settled one item into its stored note. */
export function joinCloseNotes(notes: string[]): string {
  return notes.join(SEPARATOR);
}

/** Reads a stored note back into its parts; a phrase it doesn't know is kept as written. */
export function parseCloseNote(note: string): CloseNotePart[] {
  return note.split(SEPARATOR).map((text): CloseNotePart => {
    const issue = /^closed (#\d+)$/.exec(text)?.[1];
    if (issue) return { kind: "issueClosed", ref: issue };
    const merge = /^merged PR (#\d+)$/.exec(text)?.[1];
    if (merge) return { kind: "prMerged", ref: merge };
    const task = /^task (#\S+) completed$/.exec(text)?.[1];
    if (task) return { kind: "taskCompleted", ref: task };
    return { kind: "unknown", text };
  });
}
