import { describe, expect, test } from "bun:test";
import { scoreCase } from "../../scripts/summary-eval.ts";
import { buildPrompt } from "../../src/server/summarize/prompt.ts";
import { EVAL_CASES } from "../fixtures/summary-eval.ts";

describe("summary evaluation cases", () => {
  test("ids are unique", () => {
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
  });

  for (const c of EVAL_CASES) {
    test(`${c.id}: the ideal summary scores perfectly`, () => {
      expect(scoreCase(c, { headline: c.idealHeadline, body: c.ideal })).toEqual({
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
        overOpen: 0,
        wrongLead: null,
        headline: [],
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
    expect(scoreCase(vague, { headline: "", body })).toMatchObject({
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
    expect(scoreCase(vague, { headline: "", body }).filler).toEqual(["記載なし"]);
  });

  test("an unparsed body finds nothing", () => {
    expect(scoreCase(vague, { headline: "", body: "Fixed three review findings." })).toMatchObject({
      parsed: false,
      openFound: 0,
    });
  });

  const many = EVAL_CASES.find((c) => c.id === "many-leftovers");
  if (!many) throw new Error("case missing");

  test("flags open items over the limit, a wrong lead and an unfit headline", () => {
    const body = [
      "- 目的: リリース",
      "- やったこと: タグ付け",
      "- 残課題:",
      "  - [todo] リリースノートの英訳",
      "  - [todo] スクリーンショット更新",
      "  - [issue] 本番デプロイが 403 で停止",
      "  - [todo] Slack での告知",
    ].join("\n");
    expect(scoreCase(many, { headline: "セクションの要約をまとめます。", body })).toMatchObject({
      openFound: 1,
      overOpen: 1,
      wrongLead: "リリースノートの英訳",
      headline: ["meta", "sentence"],
    });
    // The stored body keeps three, but the model wrote six: the cap doesn't hide that
    const kept = body.split("\n").slice(0, -1).join("\n");
    expect(scoreCase(many, { headline: "", body: kept, openWritten: 6 }).overOpen).toBe(3);
  });
});
