## 1. 実装

- [x] 1.1 `frontend/src/app/layout.tsx` に `<head>` ブロックを追加し、`NEXT_PUBLIC_API_BASE_URL` が設定されている場合のみ preconnect / dns-prefetch `<link>` タグを出力する（`crossOrigin="anonymous"` 付き）
- [x] 1.2 同じ `<head>` ブロックに、`NEXT_PUBLIC_SUPABASE_URL` が設定されている場合のみ preconnect / dns-prefetch `<link>` タグを出力する

## 2. テスト（TDD: Red → Green）

- [x] 2.1 `frontend/src/app/layout.test.tsx` を作成し、以下の 3 シナリオのテストを記述する（最初は Red）
  - 両方の環境変数が設定されている場合: `<link rel="preconnect">` と `<link rel="dns-prefetch">` が合計 4 つ出力される
  - API URL のみ設定の場合: API の 2 タグのみ出力され、Supabase のタグは含まれない
  - 環境変数が未設定の場合: リソースヒントタグが出力されない
- [x] 2.2 `crossOrigin="anonymous"` 属性が `<link rel="preconnect">` に付いていることを確認するテストを追加する（最初は Red）
- [x] 2.3 実装を追加して全テストが Green になることを確認する（`npx vitest run`）

## 3. 静的検証

- [x] 3.1 `cd frontend && npx tsc --noEmit` が通ることを確認する
- [x] 3.2 `cd frontend && npx biome check src/app/layout.tsx` が通ることを確認する
