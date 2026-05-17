# Google 認証 設計ドキュメント

**日付**: 2026-05-17  
**対象**: Pantry Panel — Google OAuth によるアクセス制御とグループ管理  

---

## 背景・目的

現行の Pantry Panel は認証なし・家族共用を前提としているが、以下の目的で Google 認証を導入する。

1. **セキュリティ**: 家族外からの不正アクセスを防ぐ
2. **グループ単位のデータ分離**: 将来の複数グループ対応の基盤を作る

初期実装では単一グループへの移行を想定し、マルチグループ管理 UI（グループ切り替え等）は対象外とする。

---

## 技術選定

- **認証**: Supabase Auth（Google OAuth プロバイダー）
- **招待方式**: 再利用可能・有効期限付きトークン（Approach C）
  - 同一リンクを家族グループに貼るだけで複数人が参加可能
  - 有効期限: 7日間（期限切れ後は再生成）

---

## データモデル

### 新規テーブル

```sql
CREATE TABLE groups (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE invitations (
    token      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by UUID        NOT NULL REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ NOT NULL,           -- 作成時 + 7日
    use_count  INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 既存テーブルへの変更

```sql
ALTER TABLE stock_items
    ADD COLUMN group_id UUID NOT NULL REFERENCES groups(id);
```

---

## 認証フロー

### ログイン

```
アプリ起動
  └─ セッションあり？
       ├─ No → /login（"Googleでサインイン" ボタン）
       │         └─ Supabase Auth コールバック → グループ確認へ
       └─ Yes → グループ確認
                  ├─ 所属あり → ホーム (/)
                  └─ 未所属  → /no-group
                                ├─ "招待リンクを持っている方はこちら"
                                └─ グループ未存在時のみ "グループを作成"
```

### 招待フロー

```
① オーナーが /invite で招待リンクを生成
      POST /api/invitations → token 発行（有効期限 7日）
      https://pantry-panel-xi.vercel.app/join?token=<uuid> をコピー・共有

② 家族がリンクを踏む
      /join?token=<uuid>
        ├─ 未ログイン → token を sessionStorage 保存 → /login
        │               ログイン後 → /join に戻る
        └─ ログイン済み → POST /api/invitations/:token/accept
                           ├─ 有効 → group_members に追加 → ホーム (/)
                           └─ 無効/期限切れ → エラー表示
```

---

## バックエンド（Lambda）

### JWT 検証ミドルウェア

全 API エンドポイントに適用する Echo ミドルウェア。

```
Authorization: Bearer <JWT>
  └─ JWKS（Supabase 公開鍵）で署名検証（起動時にキャッシュ）
       ├─ 失敗 → 401
       └─ 成功 → user_id を claims から取得
                  └─ group_members から group_id を取得
                       ├─ 未所属 → 403
                       └─ 所属あり → context に user_id / group_id をセット
```

### 環境変数

| 変数名 | 値 |
|--------|----|
| `SUPABASE_JWKS_URL` | `https://<project-ref>.supabase.co/auth/v1/keys` |

### 既存ハンドラの変更

- 全 `stock_items` CRUD: `WHERE group_id = <context>` を追加
- 新規作成時: `group_id` を自動セット

### 新規エンドポイント

| メソッド | パス | 説明 | 権限 |
|---------|------|------|------|
| `POST` | `/api/groups` | グループ作成 | 認証必須・グループ未所属のみ |
| `GET` | `/api/groups/me` | 自グループ情報取得 | 認証必須 |
| `POST` | `/api/invitations` | 招待トークン生成 | 認証必須・owner のみ |
| `POST` | `/api/invitations/:token/accept` | 招待承認・グループ参加 | 認証必須 |

---

## RLS（Row-Level Security）

### stock_items

```sql
-- 既存ポリシーを削除
DROP POLICY IF EXISTS "stock_items authenticated select" ON public.stock_items;
DROP POLICY IF EXISTS "stock_items anon select" ON public.stock_items;

-- 自グループの行のみ SELECT
CREATE POLICY "stock_items authenticated select"
  ON public.stock_items FOR SELECT TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM group_members
      WHERE user_id = auth.uid()
    )
  );
-- anon は除外（認証必須のため）
```

### group_members / invitations

```sql
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_members authenticated select"
  ON public.group_members FOR SELECT TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invitations authenticated select"
  ON public.invitations FOR SELECT TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );
```

**注意**: Lambda は `postgres` ロールで接続するため RLS をバイパスする。RLS は Supabase Realtime 経由の読み取り制御のみが目的。

---

## フロントエンド

### 新規ページ

| パス | 役割 |
|------|------|
| `/login` | Google サインインボタンのみ |
| `/join` | 招待トークン処理（`?token=<uuid>`） |
| `/no-group` | グループ未所属ユーザー向け案内 |
| `/invite` | 招待リンク生成・コピー（オーナー用） |

### AuthContext（`src/contexts/AuthContext.tsx`）

アプリ全体に以下を提供:
- `session`: Supabase セッション（JWT を含む）
- `user`: ログイン中ユーザー情報
- `group`: 所属グループ情報（id, name, role）
- `signInWithGoogle()` / `signOut()`

### AuthGuard（`src/components/AuthGuard.tsx`）

```
未ログイン                    → /login
ログイン済み・グループ未所属   → /no-group
ログイン済み・グループ所属     → 通過
```

### 既存コードへの影響

- API クライアント: 全リクエストに `Authorization: Bearer <JWT>` ヘッダーを追加
- `useStockItemsRealtime`: `session` を受け取り `supabase.auth.setSession()` でセット。未ログイン時は購読しない
- ヘッダー: グループ名表示・サインアウトボタンを追加

---

## データ移行

認証機能のデプロイ直前に Supabase SQL Editor で実施する。

```sql
-- 1. 既存データをバックアップ（SQL Editor でエクスポート）
-- SELECT * FROM stock_items;

-- 2. グループ作成
INSERT INTO groups (name) VALUES ('我が家') RETURNING id;
-- → <group_uuid> を控える

-- 3. 初回ユーザーを owner として追加（Supabase Auth でログイン後）
INSERT INTO group_members (group_id, user_id, role)
VALUES ('<group_uuid>', '<user_uuid>', 'owner');

-- 4. 既存データを全削除
DELETE FROM stock_items;

-- 5. group_id 付きで再投入
-- バックアップCSVを一時テーブルに COPY してから INSERT する例:
CREATE TEMP TABLE stock_items_backup (LIKE stock_items);
-- \COPY stock_items_backup FROM 'backup.csv' CSV HEADER;  ← psql クライアントで実行
INSERT INTO stock_items (id, name, category, image_url, want_to_buy,
  created_at, updated_at, group_id)
SELECT id, name, category, image_url, want_to_buy,
  created_at, updated_at, '<group_uuid>'
FROM stock_items_backup;
```

マイグレーションファイルとして `backend/db/migrations/005_add_groups.sql`（テーブル作成）および `006_add_group_id_to_stock_items.sql`（カラム追加）に記録する。

---

## 実装工数見積もり

`XL`（複数週）— wishlist 記載通り。Supabase Auth 設定・RLS 更新・バックエンド JWT ミドルウェア・フロントエンド認証フロー・データ移行が全機能に波及する。
