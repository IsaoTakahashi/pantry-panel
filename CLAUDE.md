# Pantry Panel

家庭の食品・日用品の在庫を管理するWebアプリ。`specs/old-product.md` の旧製品仕様をベースに、新スタックで作り直すプロジェクト。

## リポジトリ構成

```
pantry-panel/
├── specs/          # 仕様書
├── frontend/       # Next.js フロントエンド（未作成）
└── backend/        # Go バックエンド API（未作成）
```

## 技術スタック

| 役割 | 技術 |
|------|------|
| Frontend | Next.js |
| Backend API | Go |

## 仕様

旧製品の仕様は `specs/old-product.md` を参照。新製品の仕様は決まり次第 `specs/` 配下に追加する。

## 開発ルール

- フロントエンドのコードは `frontend/` 配下に置く
- バックエンドのコードは `backend/` 配下に置く
- 仕様変更・設計決定は `specs/` 配下のドキュメントに記録する
