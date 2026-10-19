import { expect, test } from "bun:test";
import { openDb } from "../../src/server/db/index.ts";
import { storeShowTrials } from "../../src/server/settings.ts";
import {
  currentVisibility,
  DEFAULT_HIDDEN_CWDS,
  isRunShown,
  type ShownRuns,
  visibleSessionSql,
} from "../../src/server/visibility.ts";

test("currentVisibility follows the stored trial-run choice and hides Kairos's own runs by default", () => {
  const db = openDb(":memory:");
  expect(currentVisibility(db)).toEqual({ runs: "automation", hiddenCwds: DEFAULT_HIDDEN_CWDS });
  storeShowTrials(db, true);
  expect(currentVisibility(db, ["/hidden"])).toEqual({ runs: "all", hiddenCwds: ["/hidden"] });
});

test.each([
  ["people", [true, false, false]],
  ["automation", [true, true, false]],
  ["all", [true, true, true]],
] as const)("isRunShown under %s: a person's, automation, trial", (runs, expected) => {
  expect([null, "automation" as const, "trial" as const].map((k) => isRunShown(k, runs))).toEqual([
    ...expected,
  ]);
});

test("visibleSessionSql keeps the same sessions as isRunShown", () => {
  const db = openDb(":memory:");
  const rows: [string, number, number, string | null][] = [
    ["person", 2, 0, null],
    ["loop", 0, 1, "automation"],
    ["probe", 0, 1, "trial"],
    ["empty", 0, 0, null],
  ];
  for (const [id, prompts, sdk, kind] of rows) {
    db.run(
      "INSERT INTO sessions (id, launch_cwd, prompt_count, sdk_prompt_count, run_kind) VALUES (?, '/x', ?, ?, ?)",
      [id, prompts, sdk, kind],
    );
  }
  const shown = (runs: ShownRuns) =>
    db
      .query<{ id: string }, []>(
        `SELECT id FROM sessions s WHERE ${visibleSessionSql({ runs, hiddenCwds: [] })} ORDER BY rowid`,
      )
      .all()
      .map((r) => r.id);
  expect(shown("people")).toEqual(["person"]);
  expect(shown("automation")).toEqual(["person", "loop"]);
  expect(shown("all")).toEqual(["person", "loop", "probe"]);
});
