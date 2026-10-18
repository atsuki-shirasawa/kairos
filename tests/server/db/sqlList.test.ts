import { expect, test } from "bun:test";
import { sqlList } from "../../../src/server/db/sqlList.ts";

test("sqlList quotes each constant inside one IN operand", () => {
  expect(sqlList(["ref", "model"])).toBe("('ref', 'model')");
});
