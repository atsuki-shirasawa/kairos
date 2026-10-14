import { expect, test } from "bun:test";
import { listedArtifactsSql } from "../../../src/server/queries/sql.ts";

test("listedArtifactsSql keeps a session's own commits and PRs", () => {
  expect(listedArtifactsSql()).toBe("kind IN ('pr', 'commit') AND is_copy = 0");
  expect(listedArtifactsSql("a")).toBe("a.kind IN ('pr', 'commit') AND a.is_copy = 0");
});
