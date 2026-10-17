import { expect, test } from "bun:test";
import { DEMO_WEEK } from "../../scripts/screenshots/demo.ts";
import { todayMessages } from "../../src/web/src/i18n/messages/today.ts";
import { toolbarMessages } from "../../src/web/src/i18n/messages/toolbar.ts";
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

test("Home: the app opens on Today, h and the mark return to it, and an old period link opens the calendar", async () => {
  const { page } = e2e;
  const heading = async () => (await page.all("heading", todayMessages().heading)).length;

  await page.open("?");
  expect(await heading()).toBe(1);

  await page.press("c");
  expect(await page.query()).toBe("?layout=calendar");
  expect(await heading()).toBe(0);
  await page.press("h");
  expect(await page.query()).toBe("");
  expect(await heading()).toBe(1);

  // A link from before the home page names a period but no layout
  await page.open(`?date=${DEMO_WEEK}`);
  expect(await heading()).toBe(0);
  await page.click(await page.get("button", toolbarMessages().home));
  expect(await heading()).toBe(1);
});
