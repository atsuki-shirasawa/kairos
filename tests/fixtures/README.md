# テスト用 fixture

`claude/` は `~/.claude` と同じ構成の架空ログ。`bun tests/fixtures/generate.ts` で生成する（手で編集しない）。

- レコードの形は、実ログ約 22 万レコード（2026-10-05 時点、Claude Code 2.1.2xx）の調査に合わせた（[builder.ts](builder.ts)）
- 本文・パス・PR などはすべて架空。実ログの内容は含まない
- 時刻の基準は 2026-09-28 00:00 UTC（= 09:00 JST）。下の表の「分」はそこからの経過分

## シナリオと期待値

P1（取り込み）の受け入れ基準として使う。「人の発言」はプロンプトとスラッシュコマンドの合計。

| # | セッション | 起動ディレクトリ | 見どころ | 期待値 |
|---|---|---|---|---|
| 1 | `1111…` basic | `/Users/me/dev/app` | 通常の作業。thinking、Edit、成功と失敗のコミット、PR、バックグラウンドタスクの通知、peer メッセージ、中断、`custom-title`、`away_summary` | 人の発言 3。タイトルは「ログイン機能」（`custom-title` > `ai-title`）。作業ブロック 2: 0–5 分、45–50.2 分。コミット 1（`1a2b3c4 feat: add login form`、失敗したものは数えない）。PR #42。振り返り文（`away_summary`）あり |
| 2 | `2222…` loop | `/Users/me/dev/app` | `/loop 30m` と 4 回の自動実行。2 回目の実行中にタスク通知 | 人の発言 2。自動実行 4 回。作業ブロック 2: 0–1 分、150–151 分（自動実行の 30・60・90・120 分台は描かない。通知も自動実行のターンに含める） |
| 3 | `3333…` headless | `/Users/me/tmp/probe` | `claude -p` 相当。`promptSource=sdk`、origin なし | 人の発言 0 → カレンダーに出さない |
| 4 | `4444…` worktree | `/Users/me/dev/app/.claude/worktrees/fix-header` | worktree の中で起動 | プロジェクトは `/Users/me/dev/app`、補助ラベル `fix-header`。作業ブロック 200–202 分 |
| 5 | `5555…` relocated | `/Users/me/dev/app` | 途中で `EnterWorktree`（`worktree-state`・`relocated` レコード、以降は cwd が変わる） | プロジェクトは `/Users/me/dev/app`、補助ラベル `refactor-api`。作業ブロック 240–243 分 |
| 6 | `6666…` subagent | `/Users/me/dev/app` | `Agent` ツールでサブエージェントを起動。ログは `<session>/subagents/agent-<id>.jsonl` と `.meta.json` | サブエージェント 1（`code-reviewer`、「PR #42 のレビュー」）。親の tool_use と `meta.json` の `toolUseId` で対応づく。作業ブロック 300–305.5 分 |
| 7 | `7777…` compaction | `/Users/me/dev/app` | `/compact`、コマンド出力、`compact_boundary`、要約の user レコード（`isCompactSummary`） | 人の発言 3（`/compact` を含む。コマンド出力と要約は含まない）。compaction 1。作業ブロック 2: 360–362 分、380–383 分 |
| 8 | `8888…` → `9999…` continued | `/Users/me/dev/app` | `continued-in` で続きのセッションへ。続き側の先頭に前セッションの会話のコピー（uuid・時刻は同じ、sessionId だけ書き換え）、同じ uuid の重複行 | `8888…`: 人の発言 1、続き先 `9999…`。`9999…`: コピーは前のセッションのものとして数えず、重複行は 1 件として、人の発言 1、作業ブロック 425–426 分。どちらのファイルを先に取り込んでも同じ結果になる |
| 9 | `aaaa…` partial | `/Users/me/dev/app` | 最終行が改行なしで途切れている（書き込み中） | 完全な行だけ取り込む（人の発言 1、Claude の返答 1）。保存する offset は途切れた行の先頭 |
| 10 | `bbbb…` blog | `/Users/me/dev/blog` | 別プロジェクト・翌日 | 2026-09-29 10:00–10:02 JST |

## 判定ルール（調査で確定したもの）

| 対象 | ルール | 根拠 |
|---|---|---|
| 人の発言 | `type=user` かつ `origin.kind=human`。`promptSource` は typed / suggestion_accepted / queued / sdk のいずれでもよい（sdk はデスクトップアプリ等からの入力） | 実ログで `human`+`sdk` に人が打った文面を確認 |
| 自動実行のターン | `turnOrigin=scheduled` の user レコードから、次の `turnOrigin=human`（または `origin.kind=human`）まで | `/loop` セッションで確認。assistant レコードは `turnOrigin` を持たないため、状態として引き継ぐ |
| 通知・peer | `task-notification` と `peer` はターンの扱いを変えない（直前のターンを引き継ぐ） | 人の作業中にも自動実行中にも届くため |
| headless | 人の発言が 0 件のセッション | `claude -p` は origin なし・`promptSource=sdk` |
| タイトル | `custom-title` > `agent-name` > `ai-title` > 最初の人の発言 | `custom-title` は `/rename` で付けた名前 |
| origin のないコマンド記録 | `/clear` 直後に作られる記録など。発言にも作業ブロックにも含めない（`/clear` から最初の発言までの待ち時間を作業と見なさない） | 実ログで、`/clear` で始まり十数分後に最初の発言があるセッションを確認 |
| 作業ディレクトリ | 最初のレコードの `cwd`。途中の `relocated` では変えない（補助ラベルにだけ使う） | |
| 重複 | 同じセッション内の同じ `uuid` は 1 件 | |
| 続きのセッションのコピー | 前のセッション（`continued-in` で指している側）と同じ `uuid` のレコードはコピー。集計・作業ブロックから除く | 実ログで、コピーは sessionId だけ書き換えられ uuid・時刻は元のままと確認（18 件の `continued-in` すべて） |
