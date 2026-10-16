import { expect, test } from "bun:test";
import { DEMO_WEEK } from "../../scripts/screenshots/demo.ts";
import { drawerOpen, selectedBlocks } from "./app.ts";
import type { Page } from "./page.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** What a reload must bring back: the URL, the period on screen, the open block. */
async function shown(page: Page) {
  return {
    query: await page.query(),
    period: (await page.all("heading")).map((h) => h.name),
    selected: await selectedBlocks(page),
    drawer: await drawerOpen(page),
  };
}

test("URL round trip: a reload brings back the period, the view and the open block", async () => {
  const { page } = e2e;
  await page.open(`?date=${DEMO_WEEK}`);
  // To the day view, a day on (the week starts on an empty Sunday), and its first block
  await page.press("d");
  await page.press("ArrowRight");
  await page.press("j");

  const before = await shown(page);
  expect(before.query).toContain("view=day");
  expect(before.selected).toHaveLength(1);
  expect(before.drawer).toBe(true);

  await page.reload();
  expect(await shown(page)).toEqual(before);
});
