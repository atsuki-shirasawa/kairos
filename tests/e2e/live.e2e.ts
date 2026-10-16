import { expect, test } from "bun:test";
import { DEMO_DAY, DEMO_WEEK } from "../../scripts/screenshots/demo.ts";
import { liveMessages } from "../../src/web/src/i18n/messages/live.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** One of each page, since the count must show whichever is open. */
const PAGES = [
  `?date=${DEMO_WEEK}`,
  `?view=day&date=${DEMO_DAY}`,
  `?view=month&date=${DEMO_WEEK}`,
  `?layout=summary&date=${DEMO_WEEK}`,
  `?layout=list&date=${DEMO_WEEK}`,
  "?layout=live",
];

test("Live: the sessions waiting on you show on the Live button and in the tab title, on every page", async () => {
  const { demo, page } = e2e;
  // Only sessions waiting on you, so each is both running and counted
  const waiting = await demo.setRegistry("on-you");
  expect(waiting).toBeGreaterThan(0);

  for (const query of PAGES) {
    await page.open(query);
    const live = await page.get("button", liveMessages().buttonLabel(waiting, waiting));
    expect({ query, title: await page.title() }).toEqual({ query, title: `(${waiting}) Kairos` });
    expect({ query, pressed: live.pressed }).toEqual({ query, pressed: query === "?layout=live" });
  }
});
