// UI language. English is the default; Japanese can be chosen from the "⋯" menu.
//
// The current locale lives at module level so that plain helpers (dates, formatting) can read it
// without threading a parameter through every call. Switching re-mounts the app (see main.tsx),
// so every render after a switch sees the new locale.
import { useSyncExternalStore } from "react";

export type Locale = "en" | "ja";

export const LOCALES: Locale[] = ["en", "ja"];

const KEY = "kairos.locale";

/** Reads the saved choice. Falls back to English when storage is unavailable (private windows). */
function load(): Locale {
  try {
    return localStorage.getItem(KEY) === "ja" ? "ja" : "en";
  } catch {
    return "en";
  }
}

let current: Locale = typeof localStorage === "undefined" ? "en" : load();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    if (next === "en") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Not persisted, but the switch still applies while the page stays open
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/**
 * Declares one area's messages. English is the source of truth; Japanese must have the same
 * shape, so a missing or mistyped key is a type error. Values may be strings or functions for
 * interpolation and plurals.
 *
 * Call the returned function at render time (or inside a helper), never at module level —
 * a module-level call would freeze the locale that was active when the module loaded.
 */
export function defineMessages<T extends Record<string, unknown>>(messages: {
  en: T;
  ja: NoInfer<Messages<T>>;
}): () => Messages<T> {
  // Messages<T> only widens literal types, so T is always assignable to it
  return () => messages[current] as Messages<T>;
}

/**
 * Widens what inference narrowed: a function like `(u) => (u === "week" ? "Week" : "Day")` is
 * inferred as returning `"Week" | "Day"`, which the Japanese side could never satisfy.
 */
type Messages<T> = { [K in keyof T]: Widen<T[K]> };
type Widen<V> = V extends string
  ? string
  : V extends (...args: infer A) => infer R
    ? (...args: A) => [R] extends [string] ? string : R
    : V;
