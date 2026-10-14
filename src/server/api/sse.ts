import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerEvent } from "../../shared/api.ts";
import type { EventHub } from "../events.ts";

/** How long an idle SSE connection waits before sending a keep-alive comment. */
const KEEPALIVE_MS = 15_000;

/**
 * Streams hub events to one client as SSE until it disconnects, with a keep-alive comment
 * whenever nothing has been sent for `KEEPALIVE_MS`.
 */
export function streamEvents(c: Context, events: EventHub): Response {
  return streamSSE(c, async (stream) => {
    const queue: ServerEvent[] = [];
    let wake: (() => void) | null = null;
    /** Resolves true after `KEEPALIVE_MS`, or false as soon as `wake` is called. */
    const idle = () =>
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(true), KEEPALIVE_MS);
        wake = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
    const unsubscribe = events.subscribe((e) => {
      queue.push(e);
      wake?.();
    });
    stream.onAbort(() => {
      unsubscribe();
      wake?.();
    });
    await stream.writeSSE({ event: "ready", data: "{}", retry: 3000 });
    while (!stream.aborted) {
      const next = queue.shift();
      if (next) {
        await stream.writeSSE({ event: next.type, data: JSON.stringify(next) });
        continue;
      }
      const timedOut = await idle();
      wake = null;
      if (timedOut) await stream.write(": keepalive\n\n");
    }
    unsubscribe();
  });
}
