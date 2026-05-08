# production-database Specification

## Purpose
TBD - created by archiving change phase2-5a-supabase-setup. Update Purpose after archive.
## Requirements
### Requirement: 本番 DB は Supabase Postgres を使用する
本番環境のデータストアは Supabase Postgres を SHALL とする。リージョンは Tokyo に近い場所を選択する。

#### Scenario: 本番 DB の存在
- **WHEN** Phase 2.5a が完了した時点
- **THEN** Supabase Dashboard に Pantry Panel 用のプロジェクトが存在する
- **AND** stock_items テーブルが作成されている

### Requirement: マイグレーションは SQL Editor で手動適用する
Phase 2.5 時点でのマイグレーションは Supabase Dashboard の SQL Editor に SQL ファイルを貼り付けて実行する SHALL。

#### Scenario: 初回マイグレーション適用
- **WHEN** Supabase プロジェクト作成直後
- **THEN** `backend/db/migrations/001_create_stock_items.sql` の内容が SQL Editor で実行されている
- **AND** `\d stock_items` 相当の確認で必要なカラム（id, name, category, image_url, want_to_buy, created_at, updated_at）が存在する

### Requirement: Backend は DATABASE_URL 環境変数で接続先を切り替える
Backend は接続文字列を環境変数 `DATABASE_URL` から読み取り、ローカル / Supabase を切り替えられる SHALL。`DATABASE_URL` 未設定時はローカルの compose Postgres に接続する MUST。

#### Scenario: Supabase に接続
- **WHEN** Backend を `DATABASE_URL=postgres://...supabase.co:5432/postgres?sslmode=require` で起動する
- **THEN** Backend が Supabase に接続できる
- **AND** `/health` が 200 を返す

#### Scenario: 環境変数なしでローカル接続
- **WHEN** Backend を `DATABASE_URL` 未設定で起動する
- **THEN** Backend が `localhost:5432` の Postgres に接続する

### Requirement: 接続は Direct Connection (5432) を使用する
Backend は Supabase に対し Direct Connection（ポート 5432）または Supavisor session mode を MUST 使用する。Transaction pooler（6543）は LISTEN/NOTIFY 不可のため Phase 3 で支障となるので NOT 使用する。

#### Scenario: ポート 5432 を使う
- **WHEN** Supabase に接続する
- **THEN** 接続文字列のポートが 5432 である

### Requirement: SSL 接続を明示する
Supabase への接続文字列は `sslmode=require` 以上を MUST 含む。

#### Scenario: SSL 必須
- **WHEN** Supabase 接続文字列を構成する
- **THEN** クエリ部分に `sslmode=require` が含まれる

### Requirement: 既存 API は Supabase 接続でも全て動作する
Phase 1-2 で実装済みの Stock Items API（一覧・登録・編集・削除・wantToBuy トグル）は Supabase 接続環境でも全て SHALL 動作する。

#### Scenario: CRUD の動作確認
- **WHEN** Backend を Supabase 接続で起動し、Frontend をローカルで起動する
- **THEN** 商品の登録・一覧表示・編集・削除・wantToBuy トグルが Phase 1-2 の挙動どおりに動く

