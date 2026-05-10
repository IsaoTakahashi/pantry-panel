# Learning: WebSocket client

## 目的

Backend (Phase 3 学習実装) と接続する WebSocket クライアントの React フックを学習する。

## 本番には載せない

- ファイル名は `*.learning.test.ts` / `*.learning.test.tsx` に MUST 統一
- `vitest.config.ts` の `exclude` で `*.learning.test.{ts,tsx}` を除外
- 専用 config `vitest.learning.config.ts` でのみ走る
- `frontend/src/app/stock-items/page.tsx` 等の本番ページから `useStockItemsWebSocket` を MUST NOT import する

## 変更ルール

- **機能追加禁止**。本番リアルタイム機構は Phase 3.5 で Supabase Realtime に置き換え
- **依存追従のみ許容**: 脆弱性対応 / API 破壊への追随

## 動作確認

### ユニット (vitest)

```bash
cd frontend
npx vitest run --config vitest.learning.config.ts
```

### CI

`.github/workflows/learning.yml` の frontend job が上記コマンドを実行する。

### ローカル手動

Backend の learning サーバを起動した状態で、playground (Storybook 等) でフックを呼ぶ。本番ページへの組込みは MUST NOT。

## ファイル構成

```
frontend/src/learning/websocket-client/
├── README.md                     (このファイル)
├── useStockItemsWebSocket.ts     (フック実装)
├── useStockItemsWebSocket.learning.test.tsx
└── types.ts                      (StockItemEvent 等)
```
