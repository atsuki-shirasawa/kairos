import { expect, test } from "bun:test";
import {
  CLAUDE_NOT_FOUND,
  summaryFailureKind,
  timedOutMessage,
} from "../../src/shared/summaryFailure.ts";

test("the server's own failure messages classify as what they mean", () => {
  expect(summaryFailureKind(CLAUDE_NOT_FOUND)).toBe("noClaude");
  expect(summaryFailureKind(timedOutMessage(180))).toBe("timeout");
});

test("claude's own error output is classified too", () => {
  expect(summaryFailureKind("Not logged in · Please run /login")).toBe("login");
  expect(summaryFailureKind("API Error: 529 overloaded")).toBe("rateLimit");
  expect(summaryFailureKind("something else")).toBe("other");
});
