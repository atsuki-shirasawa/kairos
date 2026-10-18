import { expect, test } from "bun:test";
import { DEMO_WEEK } from "../../scripts/screenshots/demo.ts";
import { toolbarMessages } from "../../src/web/src/i18n/messages/toolbar.ts";
import type { Page } from "./page.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** Keeps what the page writes to the clipboard, which a headless browser may not let it read back. */
async function captureClipboard(page: Page): Promise<void> {
  await page.evaluate(`
    window.__copied = null;
    navigator.clipboard.write = async (items) => {
      window.__copied = await (await items[0].getType("text/plain")).text();
    };
  `);
}

/** Opens the standup menu and copies one of its periods; resolves to the text copied. */
async function copyStandup(page: Page, period: RegExp): Promise<string> {
  const m = toolbarMessages();
  await captureClipboard(page);
  await page.click(await page.get("button", m.standup));
  await page.click(await page.get("button", period));
  await page.eventually(
    "the report to be copied",
    async () => (await page.evaluate("window.__copied")) !== null,
  );
  return String(await page.evaluate("window.__copied"));
}

test("Standup: one click copies the last workday's report from any page", async () => {
  const { page } = e2e;
  await page.open("/today");
  const text = await copyStandup(page, /^Last workday/);
  // The demo's last workday before the capture's day
  expect(text).toStartWith("# Work report: 2026-10-02\n");
  expect(text).toContain("### atlas\n\n- 10:00–11:10 Release notes and changelog for atlas 2.4");
  expect(text).toContain("## Open items");
});

test("Standup: a page with a period also offers that period as shown", async () => {
  const { page } = e2e;
  await page.open(`/journal/${DEMO_WEEK}`);
  const text = await copyStandup(page, /^The week on screen/);
  expect(text).toStartWith("# Work report: 2026-09-27 – 2026-10-03\n");
  expect(text).toContain("## 2026-09-28 (Mon)");
});
