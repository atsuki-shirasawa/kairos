import { expect, test } from "bun:test";
import { isPrompt, isRequest } from "../../../src/server/ingest/activityKinds.ts";
import type { ActivityRow } from "../../../src/server/ingest/statements.ts";

/** A human row of `kind`. */
const row = (kind: string): ActivityRow => ({
  ts: 0,
  kind,
  text: null,
  is_scheduled: 0,
  tool_name: null,
  input: null,
});

test.each([
  ["prompt", true, true],
  ["command", true, true],
  ["sdk_prompt", false, true],
  ["scheduled", false, true],
  ["assistant", false, false],
  ["tool_use", false, false],
])("a %s row: isPrompt %p, isRequest %p", (kind, prompt, request) => {
  expect(isPrompt(row(kind))).toBe(prompt);
  expect(isRequest(row(kind))).toBe(request);
});
