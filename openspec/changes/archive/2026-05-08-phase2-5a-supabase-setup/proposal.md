## Why

Phase 2.5（初回デプロイ）の最初のステップとして、ローカル Postgres から Supabase（マネージド Postgres）への接続を確立する。Phase 2.5b 以降のサービス（App Runner / Vercel）が稼働するために、共有データストアが本番側に存在している必要がある。

## What Changes

- Supabase プロジェクトを新規作成する（ユーザー手作業）
- 既存マイグレーション `backend/db/migrations/001_create_stock_items.sql` を Supabase の SQL Editor で適用する
- Backend を Supabase Direct Connection (5432) または Supavisor session mode で動作させ、`DATABASE_URL` 環境変数で切り替えられることを確認する（Phase 3 で `LISTEN/NOTIFY` を使うため transaction pooler 6543 は不可）
- Backend が SSL 必須の Supabase に対して `sslmode=require` で接続できることを確認する
- ローカルから Supabase に接続して既存の API テスト（CRUD）が通ることを動作確認する
- `specs/features.md` ・ `.claude/rules/backend.md` の手順を最新化する

## Capabilities

### New Capabilities

- `production-database`: 本番 DB（Supabase Postgres）への接続要件と SSL / プーラー方針を定義する

### Modified Capabilities

（なし）

## Impact

- `backend/main.go`: 既に `DATABASE_URL` 駆動になっているが、SSL を含む接続文字列の動作を実機で検証
- `backend/db/db.go`: 必要に応じて `sslmode=require` 対応の確認
- 新しい依存追加なし
- ドキュメント: 接続文字列の取得手順、Supabase プロジェクトの作成手順
