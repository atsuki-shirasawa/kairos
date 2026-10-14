import { expect, test } from "bun:test";
import { projectsById, visibleOnly } from "../../src/cli/projects.ts";
import type { Project } from "../../src/shared/api.ts";

const project = (id: number, hidden: boolean): Project => ({
  id,
  path: `/r/${id}`,
  name: `p${id}`,
  repo: null,
  color: null,
  hidden,
});
const projects = projectsById([project(1, false), project(2, true)]);

test("projects are looked up by id", () => {
  expect(projects.get(2)?.name).toBe("p2");
  expect([...projects.keys()]).toEqual([1, 2]);
});

test("hidden projects' items are left out; work outside a project or in an unknown one stays", () => {
  const items = [1, 2, null, 9].map((projectId, i) => ({ i, projectId }));
  expect(visibleOnly(items, projects).map((x) => x.i)).toEqual([0, 2, 3]);
});
