---
name: ship-local
description: 変更を検証してビルドし、バックグラウンドで動いている kairos サーバーを再起動して、手元の常用環境に反映する。
disable-model-invocation: true
---

# 手元の Kairos に反映する

1. `bun run check` を実行する。失敗したらここで止め、失敗内容を報告する（ビルド・再起動はしない）
2. `bun run build`（`dist/web` を作り直す）
3. `kairos restart`
4. 確認する
   - `kairos status` で動いていること、PID
   - `curl -s http://127.0.0.1:4319/api/health` が `"name":"kairos"` を返すこと
   - 起動直後は取り込みが走るので、`~/Library/Logs/kairos/server.log` の末尾にエラーがないこと
5. `PARSER_VERSION` / `DERIVED_VERSION` を上げた変更なら、再取り込み・再計算が走る旨を添える

`kairos` コマンドが見つからなければ、README の「セットアップ」（`bun link`）が済んでいない。勝手に `bun link` せず、ユーザーに伝える。
