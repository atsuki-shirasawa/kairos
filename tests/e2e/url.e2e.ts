import { expect, test } from "bun:test";
import { DEMO_DAY, DEMO_WEEK, DRAWER_SESSION } from "../../scripts/screenshots/demo.ts";
import { BASE_URL } from "../../scripts/screenshots/demoServer.ts";
import { todayMessages } from "../../src/web/src/i18n/messages/today.ts";
import { toolbarMessages } from "../../src/web/src/i18n/messages/toolbar.ts";
import { drawerOpen, selectedBlocks } from "./app.ts";
import type { Page } from "./page.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** What a reload must bring back: the URL, the period on screen, the open block. */
async function shown(page: Page) {
  return {
    url: await page.url(),
    period: (await page.all("heading")).map((h) => h.name),
    selected: await selectedBlocks(page),
    drawer: await drawerOpen(page),
  };
}

test("URL round trip: a reload brings back the period, the view and the open block", async () => {
  const { page } = e2e;
  await page.open(`/journal/${DEMO_WEEK}`);
  // To the day view, a day on (the week starts on an empty Sunday), and its first block
  await page.press("d");
  await page.press("ArrowRight");
  await page.press("j");

  const before = await shown(page);
  expect(before.url).toStartWith("/journal/2026-09-28?view=day&session=");
  expect(before.selected).toHaveLength(1);
  expect(before.drawer).toBe(true);

  // The server answers the Journal's path with the app
  await page.reload();
  expect(await shown(page)).toEqual(before);
});

test("Home: the app opens on Today, h and the mark return to it, and c goes to the Journal", async () => {
  const { page } = e2e;
  const heading = async () => (await page.all("heading", todayMessages().heading)).length;

  await page.open("/");
  expect(await heading()).toBe(1);
  expect(await page.url()).toBe("/today");

  await page.press("c");
  expect(await page.url()).toBe("/journal");
  expect(await heading()).toBe(0);
  await page.press("h");
  expect(await page.url()).toBe("/today");
  expect(await heading()).toBe(1);

  await page.open(`/journal/${DEMO_WEEK}`);
  expect(await heading()).toBe(0);
  await page.click(await page.get("button", toolbarMessages().home));
  expect(await heading()).toBe(1);
});

test("Old links: a query URL from before the paths opens the same thing at its path", async () => {
  const { page } = e2e;
  // As the CLI wrote them: a day in the day view with a session's drawer
  await page.open(`?view=day&date=${DEMO_DAY}&session=${DRAWER_SESSION}`);
  expect(await page.url()).toBe(`/journal/${DEMO_DAY}?view=day&session=${DRAWER_SESSION}`);
  expect(await drawerOpen(page)).toBe(true);
  // A period without a layout, from before the home page
  await page.open(`?date=${DEMO_WEEK}`);
  expect(await page.url()).toBe(`/journal/${DEMO_WEEK}`);
  await page.open(`?layout=summary&date=${DEMO_WEEK}`);
  expect(await page.url()).toBe(`/journal/${DEMO_WEEK}?tab=insights`);
});

test("Server: the UI's paths are the app, and other paths stay not found", async () => {
  const status = async (path: string) => (await fetch(new URL(path, BASE_URL))).status;
  expect(await status(`/journal/${DEMO_DAY}`)).toBe(200);
  expect(await status("/today")).toBe(200);
  expect(await status("/journal/x")).toBe(404);
  expect(await status("/nope")).toBe(404);
});
