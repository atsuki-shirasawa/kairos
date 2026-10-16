import { describe, expect, test } from "bun:test";
import { headlineFlaws } from "../../../src/server/summarize/headline.ts";

describe("headlineFlaws", () => {
  test("a headline that names the work has none", () => {
    expect(headlineFlaws("日本語検索修正の PR #57 作成と CI 待ち", "ja")).toEqual([]);
    expect(headlineFlaws("SQLite job queue for outgoing emails", "en")).toEqual([]);
    // Work on summaries themselves is still work
    expect(headlineFlaws("要約プロンプトの改善と 100 件の再生成", "ja")).toEqual([]);
    expect(headlineFlaws("Summary drawer layout for long bodies", "en")).toEqual([]);
    // Words that are meta only in the model's mouth
    expect(headlineFlaws("Headline length rules for summaries", "en")).toEqual([]);
    expect(headlineFlaws("Wait time fix for the checkout queue", "en")).toEqual([]);
    expect(headlineFlaws("ヘッドライン生成ルールの見直しと再生成", "ja")).toEqual([]);
    expect(headlineFlaws("Markdown 目次の見出しを作成する処理の追加", "ja")).toEqual([]);
  });

  test("talk about the task or the model's own process is meta", () => {
    for (const headline of [
      "_Headline_ — not needed; here is the summary",
      "Hmm, wait — let me reconsider the format first",
      "Here’s the summary of the export changes",
      "STOP: The section above is a system-style environment block, not a request",
      "Writing the section summary now, in the requested format",
      "Line 1 must be a short noun phrase without symbols",
      "- Goal: rename the config key",
    ])
      expect(headlineFlaws(headline, "en")).toContain("meta");
    for (const headline of [
      "ここでは要約だけを出力し、コードの作業は行わない",
      "依頼の内容を見出しにする、作業の実体はない記録",
      "ご指定の形式で書いた要約を 2 点にまとめる記録",
      "ビルドキャッシュ削減の作業についてまとめます",
      "BILLING-12 のセクション要約",
    ])
      expect(headlineFlaws(headline, "ja")).toContain("meta");
  });

  test("a sentence is flagged by its ending", () => {
    expect(headlineFlaws("設定の読み取りが拒否されて作業が止まりました", "ja")).toEqual([
      "sentence",
    ]);
    expect(headlineFlaws("リリースのタグを付けてプッシュまで完了した", "ja")).toEqual(["sentence"]);
    expect(headlineFlaws("The deploy stopped on a permission error.", "en")).toEqual(["sentence"]);
  });

  test("a length outside the rules is flagged, in characters or words", () => {
    expect(headlineFlaws("TTL の変更", "ja")).toEqual(["length"]);
    // Spaces around English words and numbers don't count toward the characters
    expect(headlineFlaws("T T L を 3 0 0 秒 に 変 更 し た 件", "ja")).toEqual(["length"]);
    expect(headlineFlaws("x".repeat(36), "ja")).toEqual(["length"]);
    expect(headlineFlaws("Queue", "en")).toEqual(["length"]);
    expect(headlineFlaws("one two three four five six seven eight nine", "en")).toEqual(["length"]);
  });
});
