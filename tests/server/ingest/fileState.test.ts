import { expect, test } from "bun:test";
import { awaitOutcomes, freshState, parseState } from "../../../src/server/ingest/fileState.ts";

test("freshState starts outside an automatic turn with nothing pending", () => {
  expect(freshState()).toEqual({
    autoTurn: false,
    pendingCommits: {},
    pendingPrs: {},
    pendingMerges: {},
  });
});

test("freshState returns a new object each time", () => {
  const a = freshState();
  a.pendingCommits.x = "git commit";
  expect(freshState().pendingCommits).toEqual({});
});

test("parseState keeps saved fields and fills in ones saved states lack", () => {
  const saved = JSON.stringify({
    autoTurn: true,
    pendingCommits: { t1: "git commit" },
    pendingPrs: {},
  });
  expect(parseState(saved)).toEqual({
    autoTurn: true,
    pendingCommits: { t1: "git commit" },
    pendingPrs: {},
    pendingMerges: {},
  });
});

test("parseState round-trips a saved state", () => {
  const state = { ...freshState(), pendingMerges: { t2: 12, t3: null } };
  expect(parseState(JSON.stringify(state))).toEqual(state);
});

test("awaitOutcomes records each outcome a call awaits under its ID", () => {
  const state = freshState();
  awaitOutcomes(state, "t1", { commit: "git commit -m x" });
  awaitOutcomes(state, "t2", { prTitle: "Add x" });
  awaitOutcomes(state, "t3", { merge: { number: null } });
  awaitOutcomes(state, "t4", {});
  expect(state).toEqual({
    autoTurn: false,
    pendingCommits: { t1: "git commit -m x" },
    pendingPrs: { t2: "Add x" },
    pendingMerges: { t3: null },
  });
});
