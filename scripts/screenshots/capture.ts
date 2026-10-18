#!/usr/bin/env bun
// Captures the screenshots in docs/images/ from a fictional week (./demo.ts), so the docs show the
// real UI without any real logs. The visual baseline (`bun run visual`) shoots the same data more
// ways; see ./demoServer.ts for how both stay apart from the everyday `kairos`.
// Run: bun run build && bun run screenshots
// To check the dark theme without touching the docs: bun run screenshots --scheme dark --out <dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Browser } from "./browser.ts";
import { type DemoServer, ROOT, requireBuild } from "./demoServer.ts";
import { withDemo } from "./harness.ts";
import { readStarts, viewNamed } from "./views.ts";

const { values: args } = parseArgs({
  options: { scheme: { type: "string", default: "light" }, out: { type: "string" } },
});
if (args.scheme !== "light" && args.scheme !== "dark") {
  console.error("--scheme must be light or dark");
  process.exit(1);
}
const scheme = args.scheme;
const OUT = args.out ? resolve(args.out) : join(ROOT, "docs", "images");

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

/** Opens each view and saves it as docs/images/screen-<name>.png. */
async function captureAll(demo: DemoServer, browser: Browser): Promise<void> {
  const starts = await readStarts(demo);
  await browser.setLook({ scheme, lang: "en", width: 1440, scale: 2 });
  mkdirSync(OUT, { recursive: true });
  for (const [file, name] of SHOTS) {
    const view = viewNamed(name);
    await demo.setRegistry(view.registry);
    const path = join(OUT, `screen-${file}.png`);
    writeFileSync(path, await browser.shoot(view.query(starts)));
    console.log(`wrote ${path}`);
  }
}

requireBuild();
await withDemo(captureAll);
