#!/usr/bin/env bun
// Captures the screenshots in docs/images/ from a fictional week (./demo.ts), so the docs show the
// real UI without any real logs. The visual baseline (`bun run visual`) shoots the same data more
// ways; see ./demoServer.ts for how both stay apart from the everyday `kairos`.
// Run: bun run build && bun run screenshots (both themes: the light shots in docs/images/, the dark
// ones in docs/images/dark/, which the docs site shows in its dark theme)
// One theme: --scheme dark (into its docs folder), or with --out <dir> to leave the docs alone
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Browser } from "./browser.ts";
import { type DemoServer, ROOT, requireBuild } from "./demoServer.ts";
import { withDemo } from "./harness.ts";
import { readStarts, viewNamed } from "./views.ts";

const { values: args } = parseArgs({
  options: { scheme: { type: "string" }, out: { type: "string" } },
});
if (args.scheme !== undefined && args.scheme !== "light" && args.scheme !== "dark") {
  console.error("--scheme must be light or dark");
  process.exit(1);
}
if (args.out && !args.scheme) {
  console.error("--out needs --scheme: one theme goes to one folder");
  process.exit(1);
}

/** Where the docs keep each theme's shots. */
const DOCS_IMAGES = join(ROOT, "docs", "images");

/** The docs' folder for a theme's shots: so one theme retaken alone lands beside its own kind. */
function docsFolder(scheme: "light" | "dark"): string {
  return scheme === "dark" ? join(DOCS_IMAGES, "dark") : DOCS_IMAGES;
}

/** The themes to shoot and where each goes: both into the docs, or the one asked for. */
const RUNS: { scheme: "light" | "dark"; out: string }[] = args.scheme
  ? [{ scheme: args.scheme, out: args.out ? resolve(args.out) : docsFolder(args.scheme) }]
  : [
      { scheme: "light", out: docsFolder("light") },
      { scheme: "dark", out: docsFolder("dark") },
    ];

/**
 * The docs' shots, in order: each file's name, and the view (see ./views.ts) it shows. Running
 * sessions only for Today, so their count on the Live button stays out of the others.
 */
const SHOTS: [file: string, view: string][] = [
  ["week", "drawer"],
  ["day", "day"],
  ["summary", "summary"],
  ["month", "month"],
  ["today", "today-running"],
];

/** Opens each view in each theme and saves it as <out>/screen-<name>.png. */
async function captureAll(demo: DemoServer, browser: Browser): Promise<void> {
  const starts = await readStarts(demo);
  for (const { scheme, out } of RUNS) {
    await browser.setLook({ scheme, lang: "en", width: 1440, scale: 2 });
    mkdirSync(out, { recursive: true });
    for (const [file, name] of SHOTS) {
      const view = viewNamed(name);
      await demo.setRegistry(view.registry);
      const path = join(out, `screen-${file}.png`);
      writeFileSync(path, await browser.shoot(view.path(starts)));
      console.log(`wrote ${path}`);
    }
  }
}

requireBuild();
await withDemo(captureAll);
