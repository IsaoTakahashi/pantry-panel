# Pantry Panel

家庭の食品・日用品の在庫を管理するWebアプリ。`specs/old-product.md` の旧製品仕様をベースに、新スタックで作り直すプロジェクト。

## リポジトリ構成

```
pantry-panel/
├── .claude/rules/  # 設計・ルール定義
├── specs/          # 仕様書
├── frontend/       # Next.js フロントエンド（未作成）
└── backend/        # Go バックエンド API（未作成）
```

## 設計・ルール

アーキテクチャや技術スタックの詳細は `.claude/rules/` 配下を参照。

| ファイル | 内容 |
|---------|------|
| `overview.md` | 全体構成・アーキテクチャ・リアルタイム同期の仕組み |
| `general.md` | frontend/backend 共通ルール |
| `frontend.md` | Next.js (TypeScript) に関する設計 |
| `backend.md` | Go (Echo) + Aurora PostgreSQL に関する設計 |

## 仕様

旧製品の仕様は `specs/old-product.md` を参照。新製品の仕様は決まり次第 `specs/` 配下に追加する。

## 開発ルール

- フロントエンドのコードは `frontend/` 配下に置く
- バックエンドのコードは `backend/` 配下に置く
- 仕様変更・設計決定は `specs/` 配下のドキュメントに記録する

## Git

- コミットメッセージは英語で100文字以内にする
- コミットメッセージに Co-Authored-By などの Author 情報は付けない
