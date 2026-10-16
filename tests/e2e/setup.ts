// Each end-to-end file runs against its own demo server and browser (the captures' harness), so a
// test that restarts the server or changes the registry can't leak into another file.
import { afterAll, beforeAll, setDefaultTimeout } from "bun:test";
import { Browser } from "../../scripts/screenshots/browser.ts";
import { DemoServer, requireBuild } from "../../scripts/screenshots/demoServer.ts";
import { Page } from "./page.ts";

/** What a test file drives: the demo server and the page in front of it. */
export interface E2E {
  demo: DemoServer;
  page: Page;
}

/** Long enough for a server restart and the event stream's reconnect. */
const TEST_TIMEOUT_MS = 60_000;

/**
 * Starts the demo server and the browser before the file's tests and stops both after. The
 * fields are set once `beforeAll` has run, so read them inside the tests.
 */
export function demoPerFile(): E2E {
  setDefaultTimeout(TEST_TIMEOUT_MS);
  const e2e = {} as E2E;
  let browser: Browser | null = null;
  beforeAll(async () => {
    requireBuild();
    e2e.demo = await DemoServer.start();
    browser = await Browser.launch();
    await browser.setLook({ scheme: "light", lang: "en", width: 1440, scale: 1 });
    e2e.page = new Page(browser);
  }, TEST_TIMEOUT_MS);
  afterAll(async () => {
    await browser?.close();
    await e2e.demo?.close();
  });
  return e2e;
}
