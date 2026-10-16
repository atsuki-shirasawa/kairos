// What the docs screenshots (`capture.ts`) and the visual baseline (`visual.ts`) share: running
// something against the demo server in the deterministic browser, and cleaning both up after.
import { Browser } from "./browser.ts";
import { DemoServer } from "./demoServer.ts";

/**
 * Starts the demo server and the browser, runs `fn` with them, and stops both however it ends,
 * Ctrl-C included (it skips `finally`; Chrome would keep its debugging port and the stand-in sleeps
 * would outlive the run).
 */
export async function withDemo<T>(
  fn: (demo: DemoServer, browser: Browser) => Promise<T>,
): Promise<T> {
  const demo = await DemoServer.start();
  let browser: Browser | null = null;
  const stop = async () => {
    await browser?.close();
    await demo.close();
  };
  process.on("SIGINT", () => void stop().finally(() => process.exit(130)));
  try {
    browser = await Browser.launch();
    return await fn(demo, browser);
  } finally {
    await stop();
  }
}
