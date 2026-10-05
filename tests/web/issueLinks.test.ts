import { describe, expect, test } from "bun:test";
import { issueBaseUrl, type MdNode, remarkIssueLinks } from "../../src/web/src/lib/issueLinks.ts";

const BASE = "https://github.com/example/repo";

/** 段落 1 つの mdast を作り、プラグインを通した後の子を返す。 */
function run(children: MdNode[]) {
  const paragraph: MdNode = { type: "paragraph", children };
  remarkIssueLinks({ baseUrl: BASE })({ type: "root", children: [paragraph] });
  return paragraph.children;
}

describe("remarkIssueLinks", () => {
  test("本文の #番号 を Issue / PR へのリンクにする", () => {
    expect(run([{ type: "text", value: "PR #12 と #345 を見直した" }])).toEqual([
      { type: "text", value: "PR " },
      { type: "link", url: `${BASE}/issues/12`, children: [{ type: "text", value: "#12" }] },
      { type: "text", value: " と " },
      { type: "link", url: `${BASE}/issues/345`, children: [{ type: "text", value: "#345" }] },
      { type: "text", value: " を見直した" },
    ]);
  });

  test("リンクの中・コード・URL の断片・文字参照は変えない", () => {
    const children: MdNode[] = [
      { type: "link", url: "https://example.com", children: [{ type: "text", value: "#1" }] },
      { type: "inlineCode", value: "#2" },
      { type: "text", value: "a#3 &#4 /path#5" },
    ];
    expect(run(structuredClone(children))).toEqual(children);
  });
});

describe("issueBaseUrl", () => {
  test("GitHub のリポジトリだけ URL にする", () => {
    expect(issueBaseUrl("github.com/example/repo")).toBe(BASE);
    expect(issueBaseUrl("gitlab.com/example/repo")).toBeNull();
    expect(issueBaseUrl(null)).toBeNull();
  });
});
