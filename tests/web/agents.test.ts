import { expect, test } from "bun:test";
import { agentName } from "../../src/web/src/lib/agents.ts";

test("names a subagent by its own name, then its type, then not at all", () => {
  expect(agentName({ name: "code-review", agentType: "general-purpose" })).toBe("code-review");
  expect(agentName({ name: null, agentType: "Explore" })).toBe("Explore");
  expect(agentName({ name: null, agentType: null })).toBeNull();
});
