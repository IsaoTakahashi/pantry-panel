# Google 認証 — Plan C: Data Migration Plan

> **Note for this project:** This plan is executed manually via Supabase Dashboard SQL Editor. There is no automated implementation. Execute each step in order, verifying after each one.
>
> **Warning:** This plan permanently modifies production data. Execute only after Plan A and Plan B are fully deployed and verified.

**Goal:** 既存の `stock_items` を単一グループに紐付け、`group_id` を全行に設定する。認証機能のデプロイ直前に実施する。

**Timing:** Plan A / B が本番にデプロイされ動作確認が取れた後、本番への切り替え直前に1回だけ実施する。

**Spec:** `docs/superpowers/specs/2026-05-17-google-auth-design.md`

**Issue:** #79

---

## 事前チェックリスト

実施前に以下が全て完了していることを確認する:

- [ ] Plan A の全タスクが main にマージ済み
- [ ] Plan B の全タスクが main にマージ済み
- [ ] Lambda に `SUPABASE_JWKS_URL` が設定済み
- [ ] Supabase Dashboard で Google プロバイダーが有効
- [ ] ローカルまたはステージングで認証フローが end-to-end で動作確認済み
- [ ] Migration 005 / 006 が Supabase 本番 DB に適用済み
- [ ] Migration 007 (RLS 更新) が Supabase 本番 DB に適用済み

---

## Task 1: 既存データのバックアップ

Supabase Dashboard → SQL Editor で実行する。

- [ ] **Step 1: 現在の stock_items を確認する**

```sql
SELECT count(*), min(created_at), max(created_at)
FROM stock_items;
```

件数と日付範囲を手元にメモしておく。

- [ ] **Step 2: 全データを CSV でエクスポートする**

Supabase Dashboard → Table Editor → stock_items → Export CSV ボタン

または SQL Editor で実行して結果をコピー:

```sql
SELECT
  id, name, category, image_url, want_to_buy,
  created_at, updated_at, sorted_at
FROM stock_items
ORDER BY sorted_at DESC;
```

ファイルとして手元に保存する（バックアップ）。

- [ ] **Step 3: バックアップの行数を確認する**

エクスポートした件数が Step 1 の count と一致することを確認する。

---

## Task 2: 最初のユーザーとグループの準備

Supabase Auth で Google ログインが完了していることが前提。

- [ ] **Step 1: Supabase Dashboard で認証済みユーザーの ID を確認する**

Supabase Dashboard → Authentication → Users から、自分のユーザー行の UUID をコピーする。
これを `<user_uuid>` として以下の手順で使用する。

- [ ] **Step 2: グループを作成する**

Supabase Dashboard → SQL Editor で実行:

```sql
INSERT INTO groups (name)
VALUES ('我が家')
RETURNING id, name, created_at;
```

返ってきた `id` を `<group_uuid>` としてメモする。

- [ ] **Step 3: 自分を owner として group_members に追加する**

```sql
INSERT INTO group_members (group_id, user_id, role)
VALUES ('<group_uuid>', '<user_uuid>', 'owner');
```

- [ ] **Step 4: 正しく登録されたことを確認する**

```sql
SELECT gm.role, g.name, gm.joined_at
FROM group_members gm
JOIN groups g ON g.id = gm.group_id
WHERE gm.user_id = '<user_uuid>';
```

Expected: `role=owner, name=我が家` の行が1件

---

## Task 3: stock_items の group_id を設定する

> **Note:** 設計書では「全削除 → 再投入」としていたが、Migration 006 で `group_id` を nullable で追加済みのため UPDATE のみで完結する。削除/再投入よりデータ損失リスクが低い。

- [ ] **Step 1: 現在の NULL 件数を確認する**

```sql
SELECT count(*) FROM stock_items WHERE group_id IS NULL;
```

全件が NULL になっているはず（Migration 006 で nullable として追加したため）。

- [ ] **Step 2: 全 stock_items に group_id を設定する**

```sql
UPDATE stock_items
SET group_id = '<group_uuid>'
WHERE group_id IS NULL;
```

- [ ] **Step 3: 更新件数を確認する**

```sql
SELECT count(*) FROM stock_items WHERE group_id = '<group_uuid>';
```

Task 1 Step 1 でメモした件数と一致することを確認する。

- [ ] **Step 4: NULL が残っていないことを確認する**

```sql
SELECT count(*) FROM stock_items WHERE group_id IS NULL;
```

Expected: `0`

---

## Task 4: Migration 008 — group_id を NOT NULL に変更する

全行に group_id が設定されたので、NULL 制約を追加する。

- [ ] **Step 1: SQL ファイルを作成する**

`backend/db/migrations/008_stock_items_group_id_not_null.sql`:

```sql
-- group_id は Plan C のデータ移行で全行に設定済みのため NOT NULL に変更する。
-- Apply after Plan C data migration is complete.
ALTER TABLE stock_items ALTER COLUMN group_id SET NOT NULL;
```

- [ ] **Step 2: Supabase Dashboard の SQL Editor で実行する**

- [ ] **Step 3: NULL が挿入できなくなったことを確認する（任意）**

```sql
-- このクエリはエラーになるはず
INSERT INTO stock_items (name, category, want_to_buy, sorted_at)
VALUES ('テスト', '食品', false, NOW());
-- Expected: ERROR: null value in column "group_id" violates not-null constraint
```

- [ ] **Step 4: コミット**

```bash
git add backend/db/migrations/008_stock_items_group_id_not_null.sql
git commit -m "Add migration 008: set group_id NOT NULL after data migration"
```

---

## Task 5: 本番動作確認

- [ ] **Step 1: アプリにアクセスしてログインできることを確認する**

本番 URL にアクセス:
1. `/login` ページが表示される
2. "Googleでサインイン" でログインできる
3. `/stock-items` に遷移し、既存の商品一覧が表示される（グループ名が表示される）

- [ ] **Step 2: 商品の CRUD が正常に動作することを確認する**

1. 新規商品を追加できる
2. 既存商品の wantToBuy をトグルできる
3. 商品を削除できる（wantToBuy=false の商品）

- [ ] **Step 3: 招待フローを確認する**

1. ヘッダーの "招待" リンクをクリック → `/invite` ページへ
2. "招待リンクを生成する" → URL が生成される
3. URL をコピーしてシークレットウィンドウで開く → `/join?token=...` ページ
4. "Googleでサインインして参加する" → 別の Google アカウントでログイン → グループに参加できる

- [ ] **Step 4: Realtime 同期を確認する**

2つのブラウザウィンドウでアプリを開き、一方で商品を追加したときに他方にも反映されることを確認する。

---

## Task 6: PR 作成とマージ

- [ ] **Step 1: 全コミットを確認する**

```bash
git log main..79-google-auth --oneline
```

- [ ] **Step 2: opsx:archive を実行する（PR マージ前に必須）**

`.claude/rules/general.md` のワークフローに従い、`opsx:archive` を実行して specs の同期とアーカイブコミットをこのブランチに含める。

- [ ] **Step 3: PR を作成する**

```bash
gh pr create \
  --title "Add Google authentication with group-based access control" \
  --body "$(cat <<'EOF'
## Summary
- Add Supabase Auth (Google OAuth) for user authentication
- Add group-based data isolation for stock_items
- Add invitation link flow (reusable, 7-day expiry) for family sharing
- Backend: JWT middleware, group/invitation endpoints, group_id scoped queries
- Frontend: AuthContext, AuthGuard, login/join/no-group/invite pages
- Data migration: existing data moved to single group (Plan C, executed manually)

## Specs & Plans
- Spec: `docs/superpowers/specs/2026-05-17-google-auth-design.md`
- Plan A (Backend): `docs/superpowers/plans/2026-05-17-google-auth-backend.md`
- Plan B (Frontend): `docs/superpowers/plans/2026-05-17-google-auth-frontend.md`
- Plan C (Data Migration): `docs/superpowers/plans/2026-05-17-google-auth-data-migration.md`

## Test plan
- [ ] `go test ./...` passes (backend)
- [ ] `npx vitest run` passes (frontend)
- [ ] End-to-end: login → stock-items → invite → join (second account) → shared view
- [ ] Realtime sync works across authenticated sessions
- [ ] Plan C data migration executed on production DB

Closes #79
EOF
)"
```

- [ ] **Step 3: CI が PASS することを確認してからマージする**

---

## ロールバック手順

**認証機能を無効に戻す場合:**

1. Lambda の環境変数から `SUPABASE_JWKS_URL` を削除 → 認証ミドルウェアが noop に戻る
2. フロントエンドの `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` はそのままでよい（`AuthGuard` は Supabase クライアントが null のとき素通りする）

**stock_items の group_id を元に戻す場合（Migration 008 の前であれば）:**

```sql
UPDATE stock_items SET group_id = NULL;
```

**Migration 008 適用後は NOT NULL 制約の解除が必要:**

```sql
ALTER TABLE stock_items ALTER COLUMN group_id DROP NOT NULL;
UPDATE stock_items SET group_id = NULL;
```
