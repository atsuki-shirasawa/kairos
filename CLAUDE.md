# Kairos

Claude Code のセッションログ（`~/.claude/projects/**/*.jsonl`）を SQLite に取り込み、カレンダーで振り返る個人用 Web アプリ。macOS・Bun 前提。

設計: [要件定義](docs/requirements.md) / [構成](docs/architecture.md) / [デザイン](docs/design.md) / [タスク分解](docs/tasks.md)

## コマンド

```sh
bun run check      # Biome + 型チェック + テスト。変更の最後に必ず通す
bun run format     # Biome で自動修正
bun test tests/server/ingest/ingester.test.ts   # 個別のテスト
bun run dev        # API :4319 + Vite :5173。先に `kairos stop`（同じポートを使う）
bun tests/fixtures/generate.ts                  # fixture を作り直す
```

手元の常用サーバーへの反映は `/ship-local`（check → build → `kairos restart`）。

## 構成

- `src/cli/` — `kairos` コマンド（`ensure` / `open` / `serve` / `ingest` など）。`daemon.ts` がバックグラウンド起動と PID 管理
- `src/server/ingest/` — 差分読み込み（`reader`）→ 分類（`classify`）→ 保存（`ingester`）→ 作業ブロック（`segments`）
- `src/server/summarize/` — セクション単位の要約。`claude -p` を副作用なしの設定で実行する
- `src/server/api/` — Hono。`security.ts` の Host 検証・CSP・書き込み防御
- `src/shared/` — API の型と定数。サーバーと画面で共有する
- `src/web/` — React 19 + Tailwind v4 + shadcn/ui（`@/` は `src/web/src`）

## 守ること

- **元ログは読み取り専用**。`~/.claude` 以下に書き込まない。テストは fixture を一時ディレクトリへコピーして使う（`tests/server/ingest/helpers.ts`）
- **`tests/fixtures/claude/` は生成物**。`tests/fixtures/generate.ts` / `builder.ts` を直して作り直す。シナリオの期待値は `tests/fixtures/README.md` が正で、解釈ルールの変更はシナリオとテストを先に足す（`/add-fixture-scenario`）
- **fixture は架空データだけ**。実ログの本文・パス・PR などを写さない
- 解釈ルールを変えたら `PARSER_VERSION`、集計・作業ブロックの計算だけ変えたら `DERIVED_VERSION` を上げる（`src/server/ingest/ingester.ts`）
- **DB スキーマは `src/server/db/index.ts` の `MIGRATIONS` の末尾に足す**。既存の要素は書き換えない
- **API のセキュリティを緩めない**: 新しいルートも `guardHost` を通し、書き込み系は `guardWrite` を通す。待ち受けは `127.0.0.1` のみ。会話の Markdown で生 HTML・画像を描画しない。変えたときは `security-reviewer` エージェントで確認する
- Claude Code のログ形式が変わった疑いがあるときは `log-format-auditor` エージェントで実ログと判定ルールを照合する

## 書き方

- コメント・ドキュメント・テスト名・UI 文言は日本語。コメントは「なぜ」を書く
- Biome の設定に従う（ダブルクォート・セミコロン・行幅 100）。編集後は hook で自動整形される
- import は拡張子付き（`./foo.ts`）
- Promise は放置しない（`noFloatingPromises`）。意図して待たないときは `void` を付ける
- 新しいライブラリの API は context7 MCP で最新の資料を確かめる（Vite 8・TS 7・Tailwind v4 など新しいメジャー版が多い）
