## Why

Phase 2.5b で本番 Backend が App Runner で稼働している。次のステップとして Frontend を Vercel にデプロイし、本番 URL から本番 Backend にアクセスできる状態にする。エンドユーザー（家族）が PWA としてブックマークから利用可能になる。

## What Changes

- Frontend の API ベース URL を `NEXT_PUBLIC_API_URL` 環境変数駆動にする
- 既存の `frontend/src/lib/api.ts` で API URL の組み立て箇所を環境変数経由に置き換える
- Vercel アカウント作成（ユーザー作業）
- Vercel プロジェクトを GitHub リポジトリから import（ユーザー作業）
  - Root Directory: `frontend/`
  - Build / Output / Install: Vercel デフォルト（Next.js プリセット）
- Vercel 環境変数: `NEXT_PUBLIC_API_URL` に Phase 2.5b の App Runner サービス URL を設定
- App Runner の `CORS_ALLOWED_ORIGINS` に Vercel 本番 URL を追記する（コンソール環境変数更新 → 自動再デプロイ）
- 本番 URL（`*.vercel.app`）からアプリを開いて、Phase 1-2 の機能が全て動作することを確認する

## Capabilities

### New Capabilities

- `production-frontend-runtime`: Frontend が Vercel 上で公開され、`NEXT_PUBLIC_API_URL` で本番 Backend と通信できる要件

### Modified Capabilities

- `production-backend-runtime`: CORS 許可 origin に Vercel 本番 URL を追加する設定変更

## Impact

- 変更: `frontend/src/lib/api.ts`（または fetch 呼び出しの集約箇所）— 環境変数化
- 新規: Vercel プロジェクト（GitHub 連携、main 自動デプロイが有効化される）
- 設定変更: App Runner 環境変数 `CORS_ALLOWED_ORIGINS` に Vercel ドメイン追加
- ドキュメント: Vercel プロジェクト設定手順、env vars の管理ルール
- バックエンド 2.5b の自動デプロイは Vercel と異なり Phase 2.5d で対応する
