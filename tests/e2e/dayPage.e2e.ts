import { expect, test } from "bun:test";
import { DEMO_DAY } from "../../scripts/screenshots/demo.ts";
import { drawerMessages } from "../../src/web/src/i18n/messages/drawer.ts";
import { blockNamed, drawerOpen, selectedBlocks } from "./app.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** The demo day's first two blocks in time order. */
const FIRST = "Token refresh race logging users out (#219)";
const SECOND = "Storybook build after the Vite 8 upgrade";

test("Day page: the first block opens beside the list, j / k step through it, and Esc keeps the pane", async () => {
  const { page } = e2e;
  await page.open(`/journal/${DEMO_DAY}?view=day`);

  await page.eventually(
    "the first block opens",
    async () => (await selectedBlocks(page)).length > 0,
  );
  expect(await selectedBlocks(page)).toEqual([blockNamed(FIRST)]);
  expect(await drawerOpen(page)).toBe(true);
  // The pane is the page's own, so it has nothing to close
  expect(await page.all("button", drawerMessages().close)).toEqual([]);

  await page.press("j");
  expect(await selectedBlocks(page)).toEqual([blockNamed(SECOND)]);
  await page.press("k");
  expect(await selectedBlocks(page)).toEqual([blockNamed(FIRST)]);

  await page.press("Escape");
  expect(await drawerOpen(page)).toBe(true);
  expect(await selectedBlocks(page)).toEqual([blockNamed(FIRST)]);
});
