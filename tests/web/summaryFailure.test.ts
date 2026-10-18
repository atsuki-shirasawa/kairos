import { afterEach, describe, expect, test } from "bun:test";
import type { SummaryFailureKind } from "../../src/shared/summaryFailure.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import { failureHint } from "../../src/web/src/lib/summaryFailure.ts";

const KINDS: SummaryFailureKind[] = ["login", "noClaude", "timeout", "rateLimit", "other"];

describe("failureHint", () => {
  afterEach(() => setLocale("en"));

  test.each(["en", "ja"] as const)("gives every failure kind a distinct hint in %s", (locale) => {
    setLocale(locale);
    const hints = KINDS.map(failureHint);
    expect(hints.every((h) => h.length > 0)).toBe(true);
    expect(new Set(hints).size).toBe(KINDS.length);
  });
});
