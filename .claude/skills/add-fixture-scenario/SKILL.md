---
name: add-fixture-scenario
description: Claude Code の新しいログ形式（未知のレコード type、origin、システムメッセージなど）に対応するため、テスト用 fixture にシナリオを足し、期待値表とテストを更新する。取り込みの解釈ルールを変える・増やすときに使う。
---

# fixture シナリオを追加する

Kairos の取り込みは「fixture の README にある期待値表」が受け入れ基準。解釈ルールを変えるときは、必ず先にシナリオを足してからコードを直す。

## 手順

1. **形を確かめる**: 実ログ（`~/.claude/projects/**/*.jsonl`）で対象のレコードを数件探し、キーの有無と値の種類を確かめる。実ログは読むだけ。本文・パス・PR 番号などをそのまま fixture に写さない（すべて架空にする）
2. **builder を拡張する**: 新しいレコードの形が必要なら `tests/fixtures/builder.ts` の `LogBuilder` にメソッドを足す。既存のメソッドの出力は変えない（既存シナリオの期待値が崩れる）
3. **シナリオを足す**
   - 既存シナリオに混ぜられるなら、そのシナリオの関数に追記する（その場合は期待値の変化も README に反映する）
   - 独立させるなら `tests/fixtures/ids.ts` の `SID` に ID を足し（`cccccccc-cccc-4ccc-8ccc-cccccccccccc` の形）、`generate.ts` に `// ---- N. 名前` の見出し付きで関数を書き、末尾のシナリオ配列に加える
   - 時刻は基準時刻（2026-09-28 00:00 UTC）からの分。既存シナリオと作業ブロックが重ならない時間帯を選ぶ
4. **生成する**: `bun tests/fixtures/generate.ts`（`tests/fixtures/claude/` は直接編集しない。hook でもブロックされる）
5. **期待値を書く**: `tests/fixtures/README.md` のシナリオ表に行を足す。調査で確定したルールなら「判定ルール」表にも根拠付きで足す。`docs/architecture.md` §3.1 の正規化ルールも合わせる
6. **テストを書く**: `tests/server/ingest/ingester.test.ts` の `describe("README のシナリオ")` に `test("N. 名前: 何を確かめるか")` を足す。分類だけの話なら `classify.test.ts`
7. **実装する**: テストが落ちることを確かめてから、`src/server/ingest/` を直す
8. **バージョンを上げる**（`src/server/ingest/ingester.ts`）
   - jsonl の解釈が変わる → `PARSER_VERSION`
   - messages からの集計・作業ブロックの計算だけが変わる → `DERIVED_VERSION`
9. **確認**: `bun run check` が通ること

## 終わったら伝えること

- 追加したシナリオと期待値（README の行）
- 上げたバージョンと、実環境で起きること（`PARSER_VERSION` なら元ログが残っているファイルの読み直し）
