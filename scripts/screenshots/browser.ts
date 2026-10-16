// A headless Chrome that renders the demo server's pages the same way on every run.
import { LOCALE_STORAGE_KEY, type Locale } from "../../src/web/src/i18n/locale.ts";
import { HeadlessChrome } from "./cdp.ts";
import { frozenDateScript } from "./clock.ts";
import { diffImages, type ImageDiff } from "./compare.ts";
import { DEMO_NOW, DEMO_TZ } from "./demo.ts";
import { BASE_URL } from "./demoServer.ts";
import { waitFor } from "./wait.ts";

/** How a page is rendered: colour scheme, UI language, viewport width and pixel ratio. */
export interface Look {
  scheme: "light" | "dark";
  lang: Locale;
  width: number;
  scale: number;
}

const HEIGHT = 900;
/** How long the page must stay still before a shot. */
const QUIET_MS = 500;

/**
 * Stops animations and transitions, and hides the caret: each would catch a different frame on
 * each run. `animation: none` rather than a paused one, since an entering element paused at its
 * first frame is invisible.
 */
const STILL_CSS =
  "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
const STILL_SCRIPT = `document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(STILL_CSS)};document.head.append(s)});`;

/**
 * Lets the capture ask whether the page has settled: no fetch in flight, fonts loaded, and no DOM
 * change or scroll for `QUIET_MS`. A fixed wait caught a day view before it scrolled to the selected
 * block now and then. Times come from `performance.now()`, since `Date` is stopped.
 *
 * It also holds each fetch until the first frame's fonts have loaded. Data that arrives while text
 * is still in the fallback font is laid out with its metrics (a line wraps that won't later), and a
 * scroll worked out then stays a pixel off on some runs and not others.
 */
const SETTLED_SCRIPT = `(() => {
  const pending = [];
  let last = performance.now();
  const touch = () => { last = performance.now(); };
  const fontsIn = new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    .then(() => document.fonts.ready);
  const fetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const url = String(args[0]);
    pending.push(url);
    touch();
    return fontsIn.then(() => fetch(...args)).finally(() => {
      pending.splice(pending.indexOf(url), 1);
      touch();
    });
  };
  new MutationObserver(touch).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  addEventListener("scroll", touch, true);
  const state = () => ({ url: location.search, ready: document.readyState, pending: [...pending],
    fonts: document.fonts.status, quietMs: Math.round(performance.now() - last) });
  // Also for the error when a page never settles
  window.__kairosState = state;
  window.__kairosSettled = () => {
    const s = state();
    return s.ready === "complete" && s.pending.length === 0 && s.fonts === "loaded" && s.quietMs > ${QUIET_MS};
  };
})();`;

/**
 * A headless Chrome that renders pages the same way on every run: the demo's time zone, a stopped
 * clock and no animation. `setLook` picks the scheme, language and size.
 */
export class Browser {
  private langScript: string | null = null;

  private constructor(private readonly chrome: HeadlessChrome) {}

  /** Starts Chrome with the settings every look shares. */
  static async launch(): Promise<Browser> {
    const chrome = await HeadlessChrome.launch();
    const browser = new Browser(chrome);
    try {
      await chrome.send("Emulation.setTimezoneOverride", { timezoneId: DEMO_TZ });
      for (const source of [frozenDateScript(DEMO_NOW), STILL_SCRIPT, SETTLED_SCRIPT])
        await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source });
    } catch (e) {
      chrome.close();
      throw e;
    }
    return browser;
  }

  /** Compares a baseline with a new shot, in this Chrome (which leaves the page blank). */
  diff(baseline: Buffer, current: Buffer): Promise<ImageDiff> {
    return diffImages(this.chrome, baseline, current);
  }

  /** Renders the next pages with this look. The UI language is the one saved in the browser. */
  async setLook(look: Look): Promise<void> {
    const c = this.chrome;
    await c.send("Emulation.setDeviceMetricsOverride", {
      width: look.width,
      height: HEIGHT,
      deviceScaleFactor: look.scale,
      mobile: false,
    });
    await c.send("Emulation.setLocaleOverride", { locale: look.lang === "ja" ? "ja-JP" : "en-US" });
    await c.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: look.scheme }],
    });
    if (this.langScript)
      await c.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.langScript });
    const source = `localStorage.setItem(${JSON.stringify(LOCALE_STORAGE_KEY)}, ${JSON.stringify(look.lang)});`;
    const { identifier } = await c.send("Page.addScriptToEvaluateOnNewDocument", { source });
    this.langScript = String(identifier);
  }

  /** Opens `query` on the demo server and returns a PNG of the viewport. */
  async shoot(query: string): Promise<Buffer> {
    await this.chrome.open(BASE_URL + query, 0);
    await this.settled();
    return this.chrome.screenshot();
  }

  /** Waits until the page says it has settled (see `SETTLED_SCRIPT`). */
  private async settled(): Promise<void> {
    try {
      await waitFor(
        "the page to settle",
        async () => (await this.evaluate("__kairosSettled")) === true,
      );
    } catch (e) {
      const state = await this.evaluate("__kairosState").catch(() => null);
      throw new Error(`${(e as Error).message}: ${JSON.stringify(state)}`);
    }
  }

  /** Calls one of `SETTLED_SCRIPT`'s functions in the page and returns its result. */
  private async evaluate(fn: string): Promise<unknown> {
    const { result } = await this.chrome.send("Runtime.evaluate", {
      expression: `window.${fn}?.()`,
      returnByValue: true,
    });
    return (result as { value: unknown }).value;
  }

  /** Stops Chrome. */
  close(): void {
    this.chrome.close();
  }
}
