// A ratchet on accessibility: axe-core runs on each page, and no rule may be broken in more places
// than tests/e2e/axe-baseline.json records. After fixing some, lower the record with
// `E2E_UPDATE_AXE=1 bun run e2e`, which only ever lowers it; a new violation is fixed, not recorded.
import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_DAY, DEMO_WEEK, DRAWER_SESSION } from "../../scripts/screenshots/demo.ts";
import type { Page } from "./page.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

const BASELINE = join(import.meta.dir, "axe-baseline.json");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

/** Violations on one page: how many elements break each rule. */
type Counts = Record<string, number>;

/** The pages checked, by name. The live page with sessions waiting, its fullest state. */
const PAGES: Record<string, string> = {
  week: `?date=${DEMO_WEEK}`,
  drawer: `?date=${DEMO_WEEK}&session=${DRAWER_SESSION}`,
  day: `?view=day&date=${DEMO_DAY}`,
  month: `?view=month&date=${DEMO_WEEK}`,
  summary: `?layout=summary&date=${DEMO_WEEK}`,
  table: `?layout=list&date=${DEMO_WEEK}`,
  live: "?layout=live",
  today: "?",
};

/** Runs axe-core on the open page and counts the elements breaking each rule. */
async function violations(page: Page): Promise<Counts> {
  const found = (await page.evaluate(`(() => {
    if (!window.axe) (0, eval)(${JSON.stringify(AXE)});
    return axe.run(document, { resultTypes: ["violations"] })
      .then((r) => r.violations.map((v) => [v.id, v.nodes.length]));
  })()`)) as [string, number][];
  return Object.fromEntries(found.sort(([a], [b]) => a.localeCompare(b)));
}

/** The rules broken in more places than the baseline allows, with both counts. */
function grown(now: Counts, allowed: Counts): string[] {
  return Object.entries(now)
    .filter(([rule, n]) => n > (allowed[rule] ?? 0))
    .map(([rule, n]) => `${rule}: ${n} (baseline ${allowed[rule] ?? 0})`);
}

/** The recorded counts per page; none before the first record, and a broken file is an error. */
function readBaseline(): Record<string, Counts> | null {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, "utf8"));
}

/**
 * The record lowered to `now` wherever it is lower, never raised: a rule broken in more places
 * than before keeps the old count, and the test still fails on it.
 */
function lowered(
  baseline: Record<string, Counts>,
  now: Record<string, Counts>,
): Record<string, Counts> {
  return Object.fromEntries(
    Object.entries(now).map(([name, counts]) => {
      const allowed = baseline[name] ?? {};
      const kept = Object.entries(counts)
        .filter(([rule]) => rule in allowed)
        .map(([rule, n]) => [rule, Math.min(n, allowed[rule] ?? 0)]);
      return [name, Object.fromEntries(kept)];
    }),
  );
}

test("accessibility: no page breaks an axe rule in more places than the baseline", async () => {
  const { demo, page } = e2e;
  await demo.setRegistry("on-you");
  const recorded = readBaseline();
  const counts: Record<string, Counts> = {};
  for (const [name, query] of Object.entries(PAGES)) {
    await page.open(query);
    counts[name] = await violations(page);
  }

  // Only the first record takes today's counts as they are
  const baseline = recorded ?? counts;
  if (process.env.E2E_UPDATE_AXE || !recorded)
    writeFileSync(BASELINE, `${JSON.stringify(lowered(baseline, counts), null, 2)}\n`);
  const worse = Object.fromEntries(
    Object.entries(counts)
      .map(([name, now]) => [name, grown(now, baseline[name] ?? {})] as const)
      .filter(([, rules]) => rules.length > 0),
  );
  expect(worse).toEqual({});
  if (JSON.stringify(counts) !== JSON.stringify(baseline))
    console.log("Fewer violations than the baseline: lower it with E2E_UPDATE_AXE=1 bun run e2e");
});
