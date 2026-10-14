import { expect, test } from "bun:test";
import {
  issueClosedNote,
  joinCloseNotes,
  parseCloseNote,
  prMergedNote,
  taskCompletedNote,
} from "../../src/shared/closeNotes.ts";

test("a stored close note reads back into the parts it was built from", () => {
  const note = joinCloseNotes([issueClosedNote("#21"), prMergedNote("#5"), taskCompletedNote("3")]);
  expect(parseCloseNote(note)).toEqual([
    { kind: "issueClosed", ref: "#21" },
    { kind: "prMerged", ref: "#5" },
    { kind: "taskCompleted", ref: "#3" },
  ]);
});

test("a phrase the parser doesn't know is kept as written", () => {
  expect(parseCloseNote("closed #2; something else")).toEqual([
    { kind: "issueClosed", ref: "#2" },
    { kind: "unknown", text: "something else" },
  ]);
});
