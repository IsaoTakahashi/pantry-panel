## 1. PPR の有効化

- [x] 1.1 `frontend/next.config.ts` に `experimental: { ppr: true }` を追加する
- [x] 1.2 `frontend/src/app/stock-items/page.tsx` を Server Component に変換する（`"use client"` を削除し、現在の中身を `StockItemsClient.tsx` に切り出す）
- [x] 1.3 `frontend/src/app/stock-items/StockItemsClient.tsx` を作成し、既存の `page.tsx` の中身（`"use client"` ロジック全体）を移動する
- [x] 1.4 `frontend/src/app/stock-items/loading.tsx` を作成し、ページ全体のスケルトン UI（ヘッダー・カードグリッドのプレースホルダー）を実装する
- [x] 1.5 `stock-items/page.tsx` で `<Suspense fallback={<StockItemsSkeleton />}>` で `StockItemsClient` を囲む

## 2. `/api/health` エンドポイントの追加

- [x] 2.1 `frontend/src/app/api/health/route.ts` を新規作成する（`export const runtime = 'nodejs'`、GET ハンドラー）
- [x] 2.2 `NEXT_PUBLIC_API_BASE_URL` を使って Go バックエンドの `/health` を fetch（タイムアウト 5 秒、`AbortController` 使用）する
- [x] 2.3 バックエンドが 200 なら `{ status: "ok", backend: { status: "ok" } }` を返す
- [x] 2.4 バックエンドが失敗・タイムアウトなら `{ status: "degraded", backend: { status: "error", message: "..." } }` を HTTP 200 で返す
- [x] 2.5 `frontend/src/app/api/health/route.test.ts` を作成し、ok / degraded / timeout の各ケースをテストする

## 3. GitHub Actions ウォームアップジョブの追加

- [x] 3.1 `.github/workflows/keep-warm.yml` を新規作成する（`on: schedule: - cron: '*/10 * * * *'`）
- [x] 3.2 ジョブのステップで `curl -sf ${{ secrets.VERCEL_APP_URL }}/api/health` を実行する
- [x] 3.3 `VERCEL_APP_URL` が未設定の場合にエラーメッセージを出して失敗するよう `if: env.VERCEL_APP_URL == ''` ガードを入れる
- [x] 3.4 GitHub リポジトリの Settings → Secrets → `VERCEL_APP_URL` に本番 URL を登録する（手動作業）

## 4. 動作確認

- [x] 4.1 ローカルで `next build` を実行し、PPR ビルドがエラーなく完了することを確認する
- [x] 4.2 `GET /api/health` をローカルで叩き、バックエンド起動中・停止中の両方でレスポンスを確認する
- [x] 4.3 Vercel にデプロイして本番 URL で `/api/health` の疎通を確認する
- [x] 4.4 GitHub Actions の keep-warm ジョブを `workflow_dispatch` で手動トリガーして成功することを確認する
