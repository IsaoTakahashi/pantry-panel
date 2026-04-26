## Why

家庭の食品・日用品の在庫管理アプリとして、商品データの CRUD が最も基本的な機能。DB スキーマ、REST API、フロントエンド一覧画面を一気通貫で構築し、以降の機能開発の基盤とする。

## What Changes

- PostgreSQL に `stock_items` テーブルを作成（マイグレーション）
- Backend に商品の CRUD API を実装（GET / POST / PATCH / DELETE）
- `specs/openapi.yml` に API 定義を追加
- Frontend に商品一覧ページを実装
- Frontend に商品登録モーダルを実装
- Frontend に商品削除機能を実装

## Capabilities

### New Capabilities
- `stock-items-api`: 商品の CRUD を提供する REST API（一覧取得、登録、更新、削除）
- `stock-items-list`: 商品一覧ページ（更新日時降順で表示、商品登録・削除の UI）

### Modified Capabilities

（なし — 既存の spec はまだない）

## Impact

- **Backend**: 新規テーブル作成、CRUD ハンドラー・リポジトリ層の追加、ルーティング追加
- **Frontend**: 新規ページ・コンポーネント群の追加、API クライアント関数の追加
- **API 定義**: `specs/openapi.yml` 新規作成
- **DB**: `stock_items` テーブルの追加（マイグレーション）
