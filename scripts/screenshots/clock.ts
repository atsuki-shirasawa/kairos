// A stopped clock for the captures: the server, the capture itself and the page all read the same
// "now", so relative times, today's marks and the live page come out the same on every run.

/** Environment variable that carries the frozen time (ms) to the server's preload (`clock.preload.ts`). */
export const FROZEN_NOW_ENV = "KAIROS_FROZEN_NOW";

/**
 * Stops `Date` at `now`: `Date.now()`, `new Date()` and `Date()` give it; dates built from a value
 * are untouched. A proxy rather than a subclass, so `Date()` without `new` still returns a string.
 * Self-contained, because the page gets it as source text (`frozenDateScript`).
 */
export function freezeDate(now: number): void {
  const Real = Date;
  globalThis.Date = new Proxy(Real, {
    construct: (target, args: unknown[]) =>
      args.length === 0 ? new target(now) : new target(...(args as [number])),
    apply: () => new Real(now).toString(),
    get: (target, key, receiver) =>
      key === "now" ? () => now : Reflect.get(target, key, receiver),
  });
}

/** Page script that stops the page's clock at `now`, to run before the app's own scripts. */
export function frozenDateScript(now: number): string {
  return `(${freezeDate.toString()})(${now});`;
}
