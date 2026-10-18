import { expect, test } from "bun:test";
import { DEMO_WEEK, sid, writeSessionLog } from "../../scripts/screenshots/demo.ts";
import { block } from "./app.ts";
import { demoPerFile } from "./setup.ts";

const e2e = demoPerFile();

/** The first prompt of the work written while the server is down, which heads its block. */
const PROMPT = "Tidy the changelog while the server is down";

test("SSE: work logged while the server was down shows after it restarts, without a reload", async () => {
  const { demo, page } = e2e;
  await page.open(`/journal/${DEMO_WEEK}`);
  expect(await page.all("button", block(PROMPT))).toEqual([]);

  // Ingested as the server starts, before the page's event stream is back: no event will say so,
  // only the page's resync after the reconnect can bring it in
  await demo.restart((claudeDir) =>
    writeSessionLog(claudeDir, {
      id: sid(900),
      cwd: "/Users/me/dev/atlas",
      branch: "main",
      title: "Changelog",
      sections: [
        { day: "10-01", start: "19:00", minutes: 30, prompts: [PROMPT], headline: PROMPT },
      ],
    }),
  );

  await page.eventually(
    "the new block",
    async () => (await page.all("button", block(PROMPT))).length === 1,
  );
});
