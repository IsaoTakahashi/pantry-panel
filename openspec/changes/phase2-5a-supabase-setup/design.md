## Context

現状、開発・テストともにローカルの Docker Compose で Postgres 18 を起動している。Phase 2.5 で本番デプロイを始めるにあたり、Backend と Frontend の前にまず DB を本番用に立ち上げる必要がある。Supabase Postgres は無料枠（500MB / 2 プロジェクト）で要件を満たし、後続の Phase 3.5 で同じ DB を使って Supabase Realtime に切り替えるため、最初から Supabase を採用する。

## Goals / Non-Goals

**Goals:**
- 本番 DB が Supabase 上で稼働している（プロジェクト作成 + マイグレーション適用済み）
- Backend がローカルから Supabase に直接続できる（DATABASE_URL 切替で）
- Direct Connection (5432) で接続できる — Phase 3 の LISTEN/NOTIFY を使うため必須

**Non-Goals:**
- Backend のホスティング（Phase 2.5b で扱う）
- Frontend のホスティング（Phase 2.5c で扱う）
- 自動マイグレーション機構の導入（マイグレーションが 1 本のみのため、SQL Editor 手動で十分）
- バックアップ・復旧戦略（Supabase の標準バックアップを使用、別 change で扱う）

## Decisions

### マイグレーション戦略: Supabase SQL Editor で手動適用

`backend/db/migrations/001_create_stock_items.sql` の中身を Supabase Dashboard の SQL Editor にコピー＆実行する。

- **採用理由**: マイグレーションは現状 1 本のみで、`golang-migrate` 等の導入はオーバーエンジニアリング。Phase 4 以降でマイグレーションが増えてきた段階で再評価する。
- **代替案**:
  - `golang-migrate` を CI で実行 → 現時点では不要
  - 起動時に `embed.FS` で適用 → スキーマ変更とアプリ起動が密結合になりロールバックがしづらい

### 接続方法: Direct Connection (5432)

Supabase の3つの接続方法のうち Direct Connection を選ぶ。

- **採用理由**: Phase 3 の自前 WebSocket で LISTEN/NOTIFY を使うため、transaction pooler (6543) は使用不可。`session pooler (5432, Supavisor)` でも LISTEN/NOTIFY 可能だがシンプルさを優先して Direct を選ぶ。
- **代替案**:
  - Transaction pooler (6543) → 接続数制限が緩いが LISTEN/NOTIFY 不可、Phase 3 で詰む
  - Supavisor session mode → 同等。将来コネクション数で困ったら切替えを検討

### SSL: `sslmode=require` を明示

- **採用理由**: Supabase は SSL 必須。`pgx` のデフォルトは `prefer` だが、本番接続文字列で `sslmode=require` を明示することで意図を明確化する。
- **代替案**: `sslmode=verify-full` → 証明書検証が厳格になるが、初回デプロイの動作確認段階では `require` で十分。後で強化する。

### 認証: パスワード認証のみ（IAM 認証なし）

- **採用理由**: Supabase の標準。IAM 認証は AWS RDS 系の機能で Supabase には存在しない。
- **代替案**: なし

## Risks / Trade-offs

- **接続パスワードを GitHub に push してしまうリスク** → `.env.local` でローカル開発、本番は AWS Secrets Manager / App Runner secrets で扱う（2.5b で確定）。今回はローカル動作確認のみで、コミットには含めない。
- **無料枠 500MB の制限** → 個人運用では十分。家族 4 人で年 1 万件登録しても KB 単位なので問題なし。
- **Direct Connection はコネクション数が少ない** → App Runner は通常 1 インスタンスで稼働するため問題化しない。スケールアウト時は Supavisor session mode に切替えを検討。
- **マイグレーションの手動適用ミス** → コピー＆実行のため typo は実質発生しない。複数本になったら自動化する。

## Migration Plan

1. Supabase アカウント作成（ユーザー）
2. 新規プロジェクトを ap-northeast-1 / Tokyo 相当のリージョンで作成（ユーザー）
3. SQL Editor で `001_create_stock_items.sql` を実行（ユーザー）
4. Project Settings → Database から Connection string (Direct) を取得
5. ローカル `.env.local` に `DATABASE_URL=postgres://...` を設定
6. Backend を `DATABASE_URL=...` で起動 → `/health` で 200、CRUD 動作確認
7. ローカルでの確認が取れたら Phase 2.5b に進む

ロールバック: ローカル接続のみのため、`.env.local` を元に戻して compose 経由の Postgres に戻すだけで完結。
