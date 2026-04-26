## Context

Health check で Frontend → Backend → DB の疎通が確認できた状態。次のステップとして、アプリのコア機能である商品 CRUD を実装する。Backend は Go + Echo、Frontend は Next.js (TypeScript)、DB は PostgreSQL。開発は TDD ベースで、ユーザーが TypeScript / Go のコードを書き、Claude がテスト設計・レビューを担当する。

## Goals / Non-Goals

**Goals:**
- `stock_items` テーブルの作成と DB マイグレーションの仕組み導入
- 商品の CRUD API（GET / POST / PATCH / DELETE）の実装
- OpenAPI 定義による API スキーマの管理
- 商品一覧ページの実装（更新日時降順表示）
- 商品登録モーダルの実装（名前 + カテゴリ）
- 商品削除機能の実装（wantToBuy=false の場合のみ削除可能）

**Non-Goals:**
- 商品情報編集（Phase 2 の機能 D）
- 買い物リスト機能（Phase 2 の機能 E）
- フィルタリング（Phase 2 の機能 F）
- リアルタイム同期（Phase 3）
- シンプルビュー・画像設定（Phase 4）
- DB マイグレーションの自動実行（当面は手動で SQL を実行）

## Decisions

### 1. DB スキーマ

```sql
CREATE TABLE stock_items (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,
    category    TEXT        NOT NULL,
    image_url   TEXT,
    want_to_buy BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- **UUID vs SERIAL**: UUID を採用。将来の WebSocket リアルタイム同期でクライアント側 ID 生成が可能になる。家庭用アプリでデータ量は少なく、パフォーマンス差は無視できる。
- **category を TEXT**: カテゴリはフロントエンドに固定リストとして持つ。DB は制約なし。将来的にユーザー定義カテゴリに拡張する場合も DB 変更不要。
- **image_url は NULL 許可**: 「未設定」を NULL で表現。フロントでデフォルト画像を表示する。

### 2. DB マイグレーション

手動 SQL ファイルで管理する。`backend/db/migrations/` にバージョン番号付きの SQL ファイルを配置。

```
backend/db/migrations/
└── 001_create_stock_items.sql
```

理由: Phase 1 ではテーブルが1つだけで、マイグレーションツール（golang-migrate 等）の導入コストに見合わない。テーブルが増えたタイミングでツール導入を検討する。

### 3. API 設計

- **PATCH vs PUT**: PATCH を採用。1フィールドの部分更新が多いユースケースに合う。
- **レスポンスの JSON キー**: camelCase（`wantToBuy`）。Frontend の TypeScript 慣習に合わせる。Backend で snake_case → camelCase の変換を行う。
- **API パス**: `/api/stock-items` に `/api/` プレフィックスを付与。将来的に Frontend と同一ドメインで配信する場合に備える。
- **API 定義**: `specs/openapi.yml` で管理。型は当面手動で定義し、エンドポイントが増えたらコード生成ツールを導入。

### 4. Backend レイヤー構成

```
backend/
├── handler/       ← HTTP ハンドラー（リクエスト解析、レスポンス生成）
├── repository/    ← DB アクセス（SQL クエリ）
├── db/            ← DB 接続、マイグレーション
└── main.go        ← ルーティング、DI
```

handler と repository を分離し、handler のテストでは repository をモック可能にする。

### 5. フィルタリング

クライアントサイドで実装する。`GET /api/stock-items` は全件を返し、フロントエンドで AND 条件フィルタを適用。商品数はせいぜい数百件で、UX（テキスト検索の即時反映）を優先。

### 6. カテゴリ固定リスト

フロントエンドに定数として定義：

```
★ / 洗面 / 100均 / KALDI / 調味料 / 飲み物 / 缶詰 / おかず / おかずの素 / おやつ / その他
```

バックエンドのバリデーションは「空文字でないこと」のみ。

## Risks / Trade-offs

- **手動マイグレーション** → テーブル数が増えると管理が煩雑になる。Phase 2 以降でツール導入を検討。
- **カテゴリ固定リスト** → ユーザーがカテゴリを追加したくなった場合、コード変更が必要。ただし旧製品で問題になっていないため、当面は許容。
- **全件取得** → 商品数が極端に多い場合にレスポンスが大きくなる。家庭用アプリでは現実的に問題にならない。
- **手動の型同期** → OpenAPI 定義と実装コードの型がズレる可能性がある。テストで検出する方針。
