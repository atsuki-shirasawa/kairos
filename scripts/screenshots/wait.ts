// Polling for the captures: the server, its data and the page each take a moment to get there.

/** How often `waitFor` asks again. */
const POLL_MS = 200;
/** How long `waitFor` keeps asking before giving up, probes included. */
const TIMEOUT_MS = 15_000;

/** Resolves after `ms` with `fallback`. */
const after = <T>(ms: number, fallback: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));

/**
 * Polls `ready` until it holds; throws naming `what` after `TIMEOUT_MS`, however long each probe
 * takes (a server that accepts and never answers, say). Errors count as not yet. Times come from
 * `performance.now()`, since the captures stop `Date`.
 */
export async function waitFor(what: string, ready: () => Promise<boolean>): Promise<void> {
  const deadline = performance.now() + TIMEOUT_MS;
  while (performance.now() < deadline) {
    const probe = ready().catch(() => false);
    if (await Promise.race([probe, after(deadline - performance.now(), false)])) return;
    await Bun.sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for ${what}`);
}
