import { describe, expect, test } from "bun:test";
import { scoreCase } from "../../scripts/summary-eval.ts";
import { buildPrompt } from "../../src/server/summarize/prompt.ts";
import { EVAL_CASES } from "../fixtures/summary-eval.ts";

describe("summary evaluation cases", () => {
  test("ids are unique", () => {
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
  });

  for (const c of EVAL_CASES) {
    test(`${c.id}: the ideal body scores perfectly`, () => {
      expect(scoreCase(c, c.ideal)).toEqual({
        id: c.id,
        parsed: true,
        openFound: c.open.length,
        openExpected: c.open.length,
        kindFit: c.open.length,
        falseResolved: [],
        falseOpen: [],
        vagueOpen: [],
        missed: [],
        extraOpen: [],
        filler: [],
      });
      // The facts reach the prompt, so a case is measured on what the summarizer really sends
      if (c.input.facts) expect(buildPrompt(c.input, c.lang)).toContain("<facts>");
    });
  }
});

describe("scoreCase", () => {
  const vague = EVAL_CASES.find((c) => c.id === "vague-leftovers");
  if (!vague) throw new Error("case missing");

  test("flags a vague leftover, a missed item and a false resolved", () => {
    const body = [
      "- 目的: レビュー対応",
      "- やったこと: 3件修正",
      "- 解決: N+1 クエリを含む全指摘",
      "- 残課題:",
      "  - [issue] 残りの指摘",
    ].join("\n");
    expect(scoreCase(vague, body)).toMatchObject({
      parsed: true,
      openFound: 0,
      falseResolved: ["N+1 クエリを含む全指摘"],
      vagueOpen: ["残りの指摘"],
      extraOpen: ["残りの指摘"],
      missed: ["the N+1 query in listOrders", "the missing index on orders.user_id"],
    });
  });

  test("flags an item that only says there is nothing for it", () => {
    const body = "- 目的: a\n- やったこと: b\n- 次の一手: 記載なし";
    expect(scoreCase(vague, body).filler).toEqual(["記載なし"]);
  });

  test("an unparsed body finds nothing", () => {
    expect(scoreCase(vague, "Fixed three review findings.")).toMatchObject({
      parsed: false,
      openFound: 0,
    });
  });
});
