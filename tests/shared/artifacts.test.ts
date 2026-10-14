import { describe, expect, test } from "bun:test";
import { prMarkdownLink, prNumber, prShortRef } from "../../src/shared/artifacts.ts";

const url = "https://github.com/me/app/pull/42";

describe("PR references", () => {
  test("prNumber takes the number from a GitHub PR URL", () => {
    expect(prNumber(url)).toBe("42");
    expect(prNumber("#42 me/app")).toBeUndefined();
  });

  test("prShortRef shortens a PR URL and keeps anything else", () => {
    expect(prShortRef(url)).toBe("#42");
    expect(prShortRef("subject:fix it")).toBe("subject:fix it");
  });

  test("prMarkdownLink links the number, or leaves the reference bare", () => {
    expect(prMarkdownLink(url)).toBe(`[#42](${url})`);
    expect(prMarkdownLink("https://example.com/x")).toBe("https://example.com/x");
  });
});
