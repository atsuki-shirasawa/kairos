import { expect, test } from "bun:test";
import { byScratchpadOwner, runLabel } from "../../../src/server/ingest/placement.ts";
import { encodeDir } from "../../../src/server/ingest/project.ts";

const PAD = "/private/tmp/claude-501/-Users-me-dev-app/0a1b/scratchpad";

test("runLabel names a run after its directory, except a scratchpad's root", () => {
  expect(runLabel("/tmp/loop-deny-probe")).toBe("loop-deny-probe");
  expect(runLabel(`${PAD}/permtest`)).toBe("permtest");
  expect(runLabel(PAD)).toBeNull();
});

test("byScratchpadOwner places a scratchpad with the project of the session that made it", () => {
  const dirs = new Map([[encodeDir("/Users/me/dev/app"), 7]]);
  expect(byScratchpadOwner(`${PAD}/permtest`, dirs)).toEqual({ id: 7, label: "permtest" });
  expect(byScratchpadOwner(PAD, dirs)).toEqual({ id: 7, label: null });
});

test("byScratchpadOwner is null for other paths and for owners not placed yet", () => {
  const dirs = new Map([[encodeDir("/Users/me/dev/app"), 7]]);
  expect(byScratchpadOwner("/tmp/loop-deny-probe", dirs)).toBeNull();
  expect(byScratchpadOwner(PAD, new Map())).toBeNull();
});
