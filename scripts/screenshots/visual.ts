#!/usr/bin/env bun
// Visual regression check: shoots every view of the fictional data (./demo.ts) and the stress day
// (./stress.ts) in light and dark, English and Japanese, 1440 and 1024 wide, and compares each
// shot with its stored baseline. Exits non-zero when any differs by more than the threshold.
//
//   bun run visual                 build, shoot, compare (writes .visual/current and .visual/diff)
//   bun run visual --only stress   only the shots whose name contains "stress"
//   bun run visual --update        after looking at the diffs: make the last run's shots the baseline
//
// Baselines live in .visual/baseline (not in git: fonts render per machine, and a hundred PNGs per
// visual change would bloat the history). /land runs this and updates them once a change lands.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { LOCALES } from "../../src/web/src/i18n/locale.ts";
import type { Browser, Look } from "./browser.ts";
import { type DemoServer, ROOT } from "./demoServer.ts";
import { withDemo } from "./harness.ts";
import { STATES_SESSION } from "./stress.ts";
import { readStarts, type Starts, VIEWS, type View } from "./views.ts";

const DIR = join(ROOT, ".visual");
const BASELINE = join(DIR, "baseline");
const CURRENT = join(DIR, "current");
const DIFF = join(DIR, "diff");

const { values: args } = parseArgs({
  options: {
    update: { type: "boolean", default: false },
    only: { type: "string" },
    threshold: { type: "string", default: "0" },
  },
});

/** Every look each view is shot in. */
const LOOKS: Look[] = (["light", "dark"] as const).flatMap((scheme) =>
  LOCALES.flatMap((lang) => [1440, 1024].map((width) => ({ scheme, lang, width, scale: 1 }))),
);

const shotName = (view: View, look: Look) =>
  `${view.name}.${look.scheme}.${look.lang}.${look.width}.png`;

/** Makes the last run's shots the baseline (only those it took, after a filtered run). */
function update(): void {
  if (!existsSync(CURRENT)) throw new Error("No shots yet. Run `bun run visual` first.");
  mkdirSync(BASELINE, { recursive: true });
  const names = readdirSync(CURRENT).filter((n) => n.endsWith(".png"));
  for (const name of names) copyFileSync(join(CURRENT, name), join(BASELINE, name));
  console.log(`baseline updated: ${names.length} shots`);
}

/** Builds the web UI, so the shots show the code as it is now rather than an old build. */
function build(): void {
  const result = Bun.spawnSync(["bun", "run", "build"], { cwd: ROOT, stdout: "ignore" });
  if (result.exitCode !== 0) throw new Error(`build failed:\n${result.stderr.toString()}`);
}

/** Puts the states session's summaries in their states for the stress drawers: failed, in progress. */
async function putSummariesInStates(demo: DemoServer, starts: Starts): Promise<void> {
  await demo.requestSummary(STATES_SESSION, starts.states.failed, "failed");
  await demo.requestSummary(STATES_SESSION, starts.states.pending, "pending");
}

/** Shoots every view in every look into .visual/current and returns the shots' names. */
async function shootViews(
  demo: DemoServer,
  browser: Browser,
  views: View[],
  starts: Starts,
): Promise<string[]> {
  const written: string[] = [];
  for (const view of views) {
    await demo.setRegistry(view.registry);
    for (const look of LOOKS) {
      await browser.setLook(look);
      const name = shotName(view, look);
      writeFileSync(join(CURRENT, name), await browser.shoot(view.path(starts)));
      written.push(name);
    }
    console.log(`shot ${view.name}`);
  }
  return written;
}

/** Compares each new shot with its baseline; returns the names that differ beyond the threshold. */
async function compare(browser: Browser, names: string[], threshold: number): Promise<string[]> {
  const failed: string[] = [];
  for (const name of names) {
    const baseline = join(BASELINE, name);
    if (!existsSync(baseline)) {
      console.log(`  new       ${name}`);
      failed.push(name);
      continue;
    }
    const diff = await browser.diff(readFileSync(baseline), readFileSync(join(CURRENT, name)));
    if (!diff.image) continue;
    writeFileSync(join(DIFF, name), diff.image);
    const ratio = diff.differing / diff.total;
    const over = ratio > threshold;
    console.log(`  ${over ? "differs" : "within "}   ${name}  ${(ratio * 100).toFixed(3)}%`);
    if (over) failed.push(name);
  }
  return failed;
}

/** Empties the output of the last run. */
function resetOutput(): void {
  // Even after a filtered run, so --update promotes only shots taken from the code as it is now
  rmSync(CURRENT, { recursive: true, force: true });
  rmSync(DIFF, { recursive: true, force: true });
  mkdirSync(CURRENT, { recursive: true });
  mkdirSync(DIFF, { recursive: true });
}

/** Says how the run went and returns the exit code. */
function report(failed: string[], total: number): number {
  if (failed.length === 0) {
    console.log(`no visual change in ${total} shots`);
    return 0;
  }
  console.log(
    `${failed.length} of ${total} shots differ from the baseline (or have none).\n` +
      "Look at .visual/diff and .visual/current; if the change is intended, run `bun run visual --update`.",
  );
  return 1;
}

/** Builds, shoots, compares and reports; resolves to the exit code. */
async function run(): Promise<number> {
  const threshold = Number(args.threshold);
  if (!Number.isFinite(threshold) || threshold < 0)
    throw new Error("--threshold must be a ratio ≥ 0");
  const views = VIEWS.filter((v) => !args.only || v.name.includes(args.only));
  if (views.length === 0) throw new Error(`no view matches "${args.only}"`);
  build();
  resetOutput();
  return withDemo(async (demo, browser) => {
    const starts = await readStarts(demo);
    await putSummariesInStates(demo, starts);
    const names = await shootViews(demo, browser, views, starts);
    return report(await compare(browser, names, threshold), names.length);
  });
}

if (args.update) update();
else process.exit(await run());
