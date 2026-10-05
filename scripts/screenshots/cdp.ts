// Just enough of the Chrome DevTools Protocol to load a page and screenshot it, so the capture
// needs no browser-automation dependency. Chrome's own `--screenshot` flag never finishes on Kairos:
// the open SSE connection keeps the page from going idle.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9334;

type Params = Record<string, unknown>;

/** A headless Chrome with one page, driven over the DevTools Protocol. */
export class HeadlessChrome {
  private seq = 0;
  private readonly pending = new Map<number, (result: Params) => void>();
  private readonly waiters = new Map<string, () => void>();

  private constructor(
    private readonly proc: ReturnType<typeof Bun.spawn>,
    private readonly ws: WebSocket,
    private readonly profile: string,
  ) {
    ws.addEventListener("message", (e) => this.receive(JSON.parse(String(e.data))));
  }

  /** Starts Chrome with a throwaway profile and attaches to its first page. */
  static async launch(): Promise<HeadlessChrome> {
    if (!existsSync(CHROME)) throw new Error(`Google Chrome not found at ${CHROME}`);
    const profile = mkdtempSync(join(tmpdir(), "kairos-chrome-"));
    const proc = Bun.spawn(
      [
        CHROME,
        "--headless=new",
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${profile}`,
        "--hide-scrollbars",
        "--no-first-run",
        "about:blank",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    const url = await pageSocketUrl();
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const chrome = new HeadlessChrome(proc, ws, profile);
    await chrome.send("Page.enable");
    return chrome;
  }

  /** Sends a protocol command and resolves with its result. */
  send(method: string, params: Params = {}): Promise<Params> {
    this.seq += 1;
    const id = this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  /** Navigates and waits for the load event, then `settleMs` more for data and fonts. */
  async open(url: string, settleMs = 1500): Promise<void> {
    const loaded = new Promise<void>((resolve) => this.waiters.set("Page.loadEventFired", resolve));
    await this.send("Page.navigate", { url });
    await loaded;
    await Bun.sleep(settleMs);
  }

  /** A PNG of the viewport. */
  async screenshot(): Promise<Buffer> {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(String(data), "base64");
  }

  /** Stops Chrome and removes its profile. */
  close(): void {
    this.ws.close();
    this.proc.kill();
    rmSync(this.profile, { recursive: true, force: true });
  }

  private receive(msg: { id?: number; method?: string; result?: Params; error?: Params }): void {
    if (msg.id !== undefined) {
      if (msg.error) throw new Error(`CDP: ${JSON.stringify(msg.error)}`);
      this.pending.get(msg.id)?.(msg.result ?? {});
      this.pending.delete(msg.id);
    } else if (msg.method) {
      this.waiters.get(msg.method)?.();
      this.waiters.delete(msg.method);
    }
  }
}

/** Waits for Chrome's debugging endpoint and returns the WebSocket URL of its page. */
async function pageSocketUrl(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = (await res.json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Not listening yet
    }
    await Bun.sleep(200);
  }
  throw new Error("Chrome did not open its debugging port");
}
