import { expect, test } from "bun:test";
import { DEMO_DAY, DEMO_WEEK } from "../../scripts/screenshots/demo.ts";
import { paletteMessages } from "../../src/web/src/i18n/messages/palette.ts";
import { drawerOpen } from "./app.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** Whether the palette is open. */
async function paletteOpen(): Promise<boolean> {
  return (await e2e.page.all("dialog", paletteMessages().title)).length > 0;
}

/** The names of the palette's rows, in order. */
async function rows(): Promise<string[]> {
  return (await e2e.page.all("option")).map((o) => o.name);
}

test("⌘K opens the palette from any page, each row showing its key, and Esc closes it", async () => {
  const { page } = e2e;
  await page.open("/today");
  await page.pressWithCommand("k");
  expect(await paletteOpen()).toBe(true);
  // A command's row ends with the key that does the same outside the palette
  expect(await rows()).toContain("Month view m");

  await page.press("Escape");
  expect(await paletteOpen()).toBe(false);
});

test("Palette: typing a day goes there, and a command runs as its key does", async () => {
  const { page } = e2e;
  await page.open(`/journal/${DEMO_WEEK}`);
  await page.pressWithCommand("k");
  await page.type(DEMO_DAY);
  expect((await rows())[0]).toBe("Go to Wed, Sep 30");
  await page.press("Enter");
  expect(await paletteOpen()).toBe(false);
  expect(await page.url()).toBe(`/journal/${DEMO_DAY}`);

  await page.pressWithCommand("k");
  await page.type("month view");
  await page.press("Enter");
  expect(await page.url()).toBe(`/journal/${DEMO_DAY}?view=month`);
});

test("Palette: work found across every period opens in the drawer", async () => {
  const { page } = e2e;
  await page.open("/today");
  await page.pressWithCommand("k");
  await page.type("token refresh");
  await page.eventually("search finds the work", async () =>
    (await rows()).some((name) => name.startsWith("Token refresh race")),
  );
  // No command holds both words, so the work leads the list
  await page.press("Enter");
  expect(await paletteOpen()).toBe(false);
  expect(await drawerOpen(page)).toBe(true);
  expect(await page.url()).toContain("session=");
});

test("Palette: a menu it opens stays open, and it opens again with an empty field", async () => {
  const { page } = e2e;
  const popoverShown = async () =>
    (await page.evaluate("!!document.querySelector('[data-slot=popover-content]')")) === true;
  await page.open(`/journal/${DEMO_WEEK}`);
  await page.pressWithCommand("k");
  await page.type("open filters");
  await page.press("Enter");
  await page.eventually("the filter menu opens", popoverShown);
  // The palette's closing hands focus back after it closes, which mustn't shut the menu
  await new Promise((r) => setTimeout(r, 500));
  expect(await popoverShown()).toBe(true);
  await page.press("Escape");

  await page.pressWithCommand("k");
  expect(await page.evaluate("document.activeElement?.value")).toBe("");
});
