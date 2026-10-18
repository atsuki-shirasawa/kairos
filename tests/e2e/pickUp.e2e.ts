import { expect, test } from "bun:test";
import { summaryMessages } from "../../src/web/src/i18n/messages/summary.ts";
import { todayMessages } from "../../src/web/src/i18n/messages/today.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

test("Pick up: closing a session's last item by hand takes its card away, and the next one moves up", async () => {
  const { page } = e2e;
  const t = todayMessages();
  await page.open("/today");
  // Five sessions left work open; three are atlas's, so its third waits behind "1 more"
  expect(await page.all("button", t.more(1))).toHaveLength(1);

  await page.click(await page.get("button", t.openItemsOf(1, "Rate limit docs")));
  expect(await page.all("list", t.itemsOf("Rate limit docs"))).toHaveLength(1);
  await page.click(await page.get("button", summaryMessages().markDone));

  await page.eventually("the card to leave Pick up", async () => {
    const card = await page.all("button", t.openItemsOf(1, "Rate limit docs"));
    return card.length === 0;
  });
  // atlas has room again, so the session behind "1 more" is shown
  expect(await page.all("button", t.more(1))).toHaveLength(0);
  expect(await page.all("button", t.openItemsOf(1, "Flaky export test"))).toHaveLength(1);
});
