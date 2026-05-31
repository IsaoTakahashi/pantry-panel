## Why

初回ロード時、HTML パース完了後にスクリプトが Lambda / Supabase へ接続するまで DNS+TLS ハンドシェイクで 200–500ms 待つ。`<head>` に preconnect / dns-prefetch ヒントを追加することで、HTML パース中に並列で接続を確立し skeleton → 商品表示フェーズを短縮する。

## What Changes

- `frontend/src/app/layout.tsx` の `<head>` に `<link rel="preconnect">` と `<link rel="dns-prefetch">` を追加
  - 対象: Lambda Function URL (`NEXT_PUBLIC_API_BASE_URL`) と Supabase URL (`NEXT_PUBLIC_SUPABASE_URL`)
- 環境変数が未設定の場合はリソースヒントを出力しない（フォールバック）

## Capabilities

### New Capabilities

- `preconnect-hints`: `layout.tsx` の `<head>` に preconnect / dns-prefetch リソースヒントを埋め込み、API・Realtime 接続の並列確立を実現する

### Modified Capabilities

（なし。既存の要件は変更しない）

## Impact

- `frontend/src/app/layout.tsx` のみ変更
- `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` を参照（既存の環境変数。追加変数なし）
- 外部 API・DB スキーマへの影響なし
- 本番デプロイ後は Network パネルで接続タイミングの早期化を確認する
