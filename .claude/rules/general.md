# General

frontend / backend 共通のルール。

## ディレクトリ構成

- `frontend/` — Next.js アプリケーション
- `backend/` — Go API サーバー
- `specs/` — 仕様書・設計ドキュメント

## 開発ツール

- **mise** — ランタイム管理（Node.js, Go）
- **gh** — GitHub CLI
- **jq** — JSON 処理

## バージョン選定

ツールやライブラリのインストール・設定時は、Web 検索で最新の安定バージョンを確認してから使用すること。学習データのバージョン情報は古い可能性がある。

## デプロイ先

AWS マネージドサービスを利用する。

## テスト戦略

Unit を厚く、Integration 中程度、E2E を薄く保つ（テストピラミッド）。詳細は frontend.md / backend.md 参照。

## CI (GitHub Actions)

- **ci.yml**: frontend (Biome → tsc → Vitest) / backend (golangci-lint → go test → testcontainers) を並列実行
- **e2e.yml**: main への PR 時のみ Playwright E2E
- **deploy-backend.yml**: `backend/**` push → ECR → Lambda 自動デプロイ（OIDC、`workflow_dispatch` で手動再実行可）

## ブランチ・Issue・PR の運用

- **ドキュメント変更を含む、プロジェクトへのすべての変更はブランチを切り、PR 経由で main にマージする。main への直接 push は原則禁止。**
- ブランチ名: `{issue番号}-{概要}`（例: `4-stock-item-crud`）
- PR 本文に `Closes #N` でマージ時に Issue 自動クローズ
- 大きなテーマは Epic（親）と Sub-Issue（子）に分割。1 Issue = 1 PR、差分 300 行以内目安
- 作業が長期化する場合は Draft PR を早めに作成

## 旧仕様の参照

旧製品の仕様は `specs/old-product.md` を参照。新製品で再現すべき機能の原典となる。

## 設計・変更管理ワークフロー

要件探索から実装完了まで、以下のツールを組み合わせて進める。

| フェーズ | ツール | タイミング |
|---------|--------|-----------|
| 設計・探索 | `superpowers:brainstorming` | 要件が曖昧・UIの視覚比較が必要なとき |
| 変更登録・タスク化 | `opsx:propose` | 設計が固まったら openspec の change として登録 |
| 実装 | `opsx:apply` | tasks.md に従って実装 |
| 完了処理 | `opsx:archive` | **PR マージ前**に実施。specs 同期・アーカイブのコミットも同じ feature ブランチに含める |

設計が明確な場合は brainstorming を省略して `opsx:propose` から始めてよい。

## 開発フロー

各機能は以下の TDD ベースのフローで進める。実装は Claude Code が主体となり、適宜 Sub Agent を活用する。ユーザーはレビューと意思決定を担当する。

| Step | 作業 | 担当 |
|------|------|------|
| 1 | 機能の洗い出し（コンポーネント、API、DB） | ユーザー → Claude |
| 1.5 | インターフェース設計（型、スキーマ定義） | Claude が草案 → ユーザーがレビュー |
| 2 | テストケース設計 | Claude が作成 → ユーザーがレビュー |
| 3 | テスト実装 | Claude Code が実装（Sub Agent 活用） → ユーザーがレビュー |
| 4 | プロダクションコード実装 | Claude Code が実装（Sub Agent 活用） → ユーザーがレビュー |
| 4.5 | 動作確認（サーバー起動、手動テスト） | Claude Code が実施 → ユーザーが最終確認 |
| 5 | リファクタリング | Claude Code が主体（Sub Agent 活用）→ ユーザーがレビュー |

### Claude の提案ルール

- 可能な限り複数の選択肢を提示し、理由付きで推奨を明示する
