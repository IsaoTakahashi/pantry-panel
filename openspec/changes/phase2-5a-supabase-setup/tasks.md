## 1. Issue・ブランチ準備

- [ ] 1.1 GitHub Issue を作成する（タイトル: "Phase 2.5a: Supabase 接続セットアップ"）
- [ ] 1.2 Issue 番号ベースのブランチを作成する
- [ ] 1.3 Draft PR を作成する

## 2. Supabase プロジェクト作成（ユーザー作業）

- [ ] 2.1 Supabase アカウントを作成する（既にあればスキップ）
- [ ] 2.2 新規プロジェクトを Tokyo に近いリージョン（ap-northeast-1 / Northeast Asia）で作成する
- [ ] 2.3 DB パスワードを安全に保管する（パスワードマネージャーまたは AWS Secrets Manager）
- [ ] 2.4 Project Settings → Database から Direct Connection の接続文字列を取得する

## 3. マイグレーション適用（ユーザー作業）

- [ ] 3.1 `backend/db/migrations/001_create_stock_items.sql` の内容を Supabase Dashboard の SQL Editor に貼り付けて実行する
- [ ] 3.2 SQL Editor で `SELECT * FROM stock_items;` を実行し、テーブルが空で存在することを確認する

## 4. Backend を Supabase 接続で動作確認

- [ ] 4.1 接続文字列に `sslmode=require` を付与する（例: `postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require`）
- [ ] 4.2 ローカル `.env.local`（または環境変数）に `DATABASE_URL` を設定する（コミットしない）
- [ ] 4.3 Backend を `DATABASE_URL` 付きで起動し、`/health` が 200 を返すことを確認する
- [ ] 4.4 既存の `backend/db/db.go` / `db_test.go` の挙動を確認し、SSL 接続でエラーが出ないか手動確認する
- [ ] 4.5 ローカルの Frontend (port 3000) から Supabase 接続済み Backend (port 8080) を経由して以下が動作することを確認する:
  - 商品の一覧表示
  - 商品登録
  - 商品編集
  - 商品削除
  - wantToBuy トグル
- [ ] 4.6 SQL Editor で実際にデータが書き込まれたことを確認する

## 5. ドキュメント更新

- [ ] 5.1 `specs/features.md` の Phase 2.5 セクションを更新（Supabase 接続済みであること）
- [ ] 5.2 README または `.claude/rules/backend.md` に Supabase 接続文字列の取得手順を追記する
- [ ] 5.3 `.gitignore` に `.env.local` が含まれていることを確認する

## 6. 仕上げ

- [ ] 6.1 CI（lint + tsc + vitest + go test）がすべてパスすることを確認する
- [ ] 6.2 PR を ready for review にして、Issue を `Closes #N` でリンクする
- [ ] 6.3 マージ後に `openspec archive phase2-5a-supabase-setup` で archive する
