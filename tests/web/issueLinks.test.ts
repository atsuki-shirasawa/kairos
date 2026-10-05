import { describe, expect, test } from "bun:test";
import { issueBaseUrl, type MdNode, remarkIssueLinks } from "../../src/web/src/lib/issueLinks.ts";

const BASE = "https://github.com/example/repo";

/** Builds a one-paragraph mdast, runs the plugin and returns the paragraph's children. */
function run(children: MdNode[]) {
  const paragraph: MdNode = { type: "paragraph", children };
  remarkIssueLinks({ baseUrl: BASE })({ type: "root", children: [paragraph] });
  return paragraph.children;
}

describe("remarkIssueLinks", () => {
  test("links #number in text to the issue / PR", () => {
    expect(run([{ type: "text", value: "Revisited PR #12 and #345 today" }])).toEqual([
      { type: "text", value: "Revisited PR " },
      { type: "link", url: `${BASE}/issues/12`, children: [{ type: "text", value: "#12" }] },
      { type: "text", value: " and " },
      { type: "link", url: `${BASE}/issues/345`, children: [{ type: "text", value: "#345" }] },
      { type: "text", value: " today" },
    ]);
  });

  test("leaves links, code, URL fragments and character references alone", () => {
    const children: MdNode[] = [
      { type: "link", url: "https://example.com", children: [{ type: "text", value: "#1" }] },
      { type: "inlineCode", value: "#2" },
      { type: "text", value: "a#3 &#4 /path#5" },
    ];
    expect(run(structuredClone(children))).toEqual(children);
  });
});

describe("issueBaseUrl", () => {
  test("builds URLs for GitHub repositories only", () => {
    expect(issueBaseUrl("github.com/example/repo")).toBe(BASE);
    expect(issueBaseUrl("gitlab.com/example/repo")).toBeNull();
    expect(issueBaseUrl(null)).toBeNull();
  });
});
