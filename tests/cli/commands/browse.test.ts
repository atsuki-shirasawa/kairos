import { expect, test } from "bun:test";
import { findProject, reportPeriod } from "../../../src/cli/commands/browse.ts";
import { CliError } from "../../../src/cli/errors.ts";
import type { Project } from "../../../src/shared/api.ts";

const project = (id: number, path: string, name: string): Project => ({
  id,
  path,
  name,
  repo: null,
  color: null,
  hidden: false,
});
const projects = [
  project(1, "/r/app", "app"),
  project(2, "/r/app/packages/ui", "ui"),
  project(3, "/r/blog", "Blog"),
];

test("a project is found by a path inside it, the innermost one winning", () => {
  expect(findProject(projects, "/r/app/src", "/").id).toBe(1);
  expect(findProject(projects, "/r/app/packages/ui/src", "/").id).toBe(2);
  expect(findProject(projects, ".", "/r/blog/posts").id).toBe(3);
  expect(findProject(projects, "../blog", "/r/app").id).toBe(3);
  // A sibling whose name only starts the same isn't inside
  expect(() => findProject(projects, "/r/application", "/")).toThrow(CliError);
});

test("a project is found by its name, ignoring case", () => {
  expect(findProject(projects, "blog", "/").id).toBe(3);
  expect(() => findProject(projects, "nosuch", "/")).toThrow("No project matches nosuch");
});

const NOW = new Date(2026, 9, 14, 12).getTime();
const midnight = (d: number) => new Date(2026, 9, d).getTime();
const option = (d: number) => ({ day: midnight(d), text: `2026-10-${d}` });

test("a report covers the day given, else --since to --until, else today", () => {
  expect(reportPeriod(undefined, undefined, undefined, NOW)).toEqual({
    from: midnight(14),
    to: midnight(15),
  });
  expect(reportPeriod(midnight(1), undefined, undefined, NOW)).toEqual({
    from: midnight(1),
    to: midnight(2),
  });
  expect(reportPeriod(undefined, option(6), option(10), NOW)).toEqual({
    from: midnight(6),
    to: midnight(11),
  });
  // --since alone runs to today; --until alone is that one day
  expect(reportPeriod(undefined, option(6), undefined, NOW)).toEqual({
    from: midnight(6),
    to: midnight(15),
  });
  expect(reportPeriod(undefined, undefined, option(1), NOW)).toEqual({
    from: midnight(1),
    to: midnight(2),
  });
});

test("a report from a day after today is refused", () => {
  expect(() => reportPeriod(undefined, option(20), undefined, NOW)).toThrow(
    "--since (2026-10-20) is after today",
  );
});
