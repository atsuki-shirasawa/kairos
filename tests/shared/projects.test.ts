import { expect, test } from "bun:test";
import { isProjectShown } from "../../src/shared/projects.ts";

test("isProjectShown leaves out only hidden projects", () => {
  const projects = new Map([
    [1, { hidden: false }],
    [2, { hidden: true }],
  ]);
  expect(isProjectShown(projects, 1)).toBe(true);
  expect(isProjectShown(projects, 2)).toBe(false);
  expect(isProjectShown(projects, null)).toBe(true);
  expect(isProjectShown(projects, 3)).toBe(true);
});
