# Kairos

Claude Code のセッション履歴から、「この日・この時間に何をしていたか」をカレンダーで振り返る個人用 Web アプリ。

- ログ（`~/.claude/projects/**/*.jsonl`）を読み取り専用で取り込み、SQLite に保存する。Claude Code がログを消しても（既定 30 日）Kairos には残る
- 作業ブロック（セクション）ごとに、`claude -p`（haiku）で要約を自動で作る
- Claude Code を起動すると、裏で自動的に立ち上がる

設計の資料: [要件定義](docs/requirements.md) / [構成](docs/architecture.md) / [デザイン](docs/design.md) / [タスク分解](docs/tasks.md)

## セットアップ

必要なもの: macOS、[Bun](https://bun.sh) 1.3 以上、Claude Code（ログイン済み。要約に使う）

```sh
git clone <this repo> ~/dev/kairos && cd ~/dev/kairos
bun install
bun run build      # 画面をビルドする（dist/web）
bun link           # kairos コマンドを ~/.bun/bin に置く
kairos open        # 起動してブラウザで開く（初回はログの取り込みに数秒かかる）
```

### Claude Code の起動時に自動で立ち上げる

`~/.claude/settings.json` の `hooks.SessionStart` に次を足す。

```json
{
  "type": "command",
  "command": "'/Users/<you>/.bun/bin/kairos' ensure 2>/dev/null || true",
  "timeout": 5
}
```

`kairos ensure` は、サーバーが動いていれば何もせず（約 20ms）、止まっていればバックグラウンドで起動してすぐ戻る。何も出力しないので、Claude の会話には影響しない。起動したサーバーは Claude Code を終了しても動き続ける。ブラウザは開かないので、見たいときに `kairos open` するか http://127.0.0.1:4319 を開く。

## 使い方

| コマンド | 内容 |
|---|---|
| `kairos open` | 起動してブラウザで開く |
| `kairos status` | 動いているか、PID、ログの場所 |
| `kairos stop` / `kairos restart` | 止める / 止めて起動し直す（Kairos を更新したあと） |
| `kairos ingest` | ログを手で取り込む（サーバーを動かさずに DB だけ作るとき） |

オプション: `--summary-model <model>`（既定 haiku）、`--no-auto-summary`（要約を自動では作らず、画面のボタンで頼んだときだけ作る）、`--port <n>`（既定 4319）

画面のキーボード操作: `←` `→` 前後へ、`t` 今日、`w` 週表示、`d` 日表示、`Esc` 詳細を閉じる

### 更新するとき

```sh
git pull && bun install && bun run build && kairos restart
```

## データの場所

| 種類 | 場所 |
|---|---|
| DB | `~/Library/Application Support/kairos/kairos.db` |
| PID | `~/Library/Application Support/kairos/kairos.pid` |
| ログ | `~/Library/Logs/kairos/server.log` |
| 要約用の作業ディレクトリ | `~/Library/Application Support/kairos/summarizer/`（空のまま） |

`KAIROS_DATA_DIR` を設定すると、DB・PID・ログをまとめて別の場所に置ける（試しに別の DB で動かすとき）。

### Claude Code のログの保存期間について

Kairos は取り込んだ内容を DB に残すので、Claude Code の `cleanupPeriodDays` を延ばさなくても、カレンダー・要約・会話は消えない。ただし、元のログが消えたセッションは、Kairos の解釈ルールを更新しても（`PARSER_VERSION`）読み直せない。気になる場合は `cleanupPeriodDays` も延ばしておく。

### アンインストール

```sh
kairos stop
bun unlink                       # kairos コマンドを外す（リポジトリで実行）
rm -rf ~/Library/Application\ Support/kairos ~/Library/Logs/kairos
```

`~/.claude/settings.json` の SessionStart から `kairos ensure` の行を消す。

## 開発

```sh
bun run dev      # API（:4319）と Vite（:5173）を同時に起動。画面は http://127.0.0.1:5173
bun run check    # Biome（lint・format）+ 型チェック + テスト
bun run format   # Biome で自動修正
```

`bun run dev` はバックグラウンドのサーバーと同じポートを使うので、先に `kairos stop` しておく。

テスト用の架空ログは `bun tests/fixtures/generate.ts` で作り直せる（[説明](tests/fixtures/README.md)）。
