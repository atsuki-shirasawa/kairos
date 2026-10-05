# Kairos

Claude Code のセッション履歴から、「この日・この時間に何をしていたか」をカレンダーで振り返る個人用 Web アプリ。

- [要件定義](docs/requirements.md) / [構成](docs/architecture.md) / [タスク分解](docs/tasks.md)

## 開発

```sh
bun install
bun run dev      # API（:4319）と Vite（:5173）を同時に起動。ブラウザは http://127.0.0.1:5173
bun run check    # Biome（lint・format）+ 型チェック + テスト
bun run format   # Biome で自動修正
bun run build    # Web をビルド（dist/web）。bun run start で API と一緒に配信
```

テスト用の架空ログは `bun tests/fixtures/generate.ts` で再生成する（[説明](tests/fixtures/README.md)）。
