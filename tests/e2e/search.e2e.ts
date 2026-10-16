import { expect, test } from "bun:test";
import { DEMO_WEEK } from "../../scripts/screenshots/demo.ts";
import { searchMessages } from "../../src/web/src/i18n/messages/search.ts";
import { block, blocks } from "./app.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** The week's two blocks about the WAL post, and one that has nothing to do with it. */
const MATCHING = ["Draft of the SQLite WAL post", "Proofread and published the SQLite WAL post"];
const OTHER = "Per-key rate limiting for the public API (#214)";

/** Below this a block reads as faded rather than shown. */
const FADED = 0.5;

test("search: blocks that don't match fade, and clearing the field brings them back", async () => {
  const { page } = e2e;
  await page.open(`?date=${DEMO_WEEK}`);

  await page.press("/");
  expect((await page.focused())?.name).toBe(searchMessages().label("week"));
  await page.type("WAL");

  for (const heading of MATCHING)
    expect(await page.opacity(await page.get("button", block(heading)))).toBe(1);
  expect(await page.opacity(await page.get("button", block(OTHER)))).toBeLessThan(FADED);

  await page.click(await page.get("button", searchMessages().clear));
  const shown = await blocks(page);
  expect(shown.length).toBeGreaterThan(MATCHING.length + 1);
  for (const b of shown)
    expect({ block: b.name, opacity: await page.opacity(b) }).toEqual({
      block: b.name,
      opacity: 1,
    });
});
