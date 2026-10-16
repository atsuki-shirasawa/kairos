import { expect, test } from "bun:test";
import { DEMO_WEEK } from "../../scripts/screenshots/demo.ts";
import { blockNamed, drawerOpen, selectedBlocks } from "./app.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** The week's first two blocks in time order (Monday morning). */
const FIRST = "Per-key rate limiting for the public API (#214)";
const SECOND = "Usage chart flicker on resize in the dashboard";

test("keyboard only: j opens the first block, j / k step, Esc closes and leaves focus on it", async () => {
  const { page } = e2e;
  await page.open(`?date=${DEMO_WEEK}`);

  await page.press("j");
  expect(await drawerOpen(page)).toBe(true);
  expect(await selectedBlocks(page)).toEqual([blockNamed(FIRST)]);

  await page.press("j");
  expect(await selectedBlocks(page)).toEqual([blockNamed(SECOND)]);
  await page.press("k");
  expect(await selectedBlocks(page)).toEqual([blockNamed(FIRST)]);

  await page.press("Escape");
  expect(await drawerOpen(page)).toBe(false);
  expect(await selectedBlocks(page)).toEqual([]);
  expect(await page.focused()).toMatchObject({ role: "button", name: blockNamed(FIRST) });
});
