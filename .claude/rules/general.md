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

## デプロイ先

AWS マネージドサービスを利用する。

## テスト戦略

テストピラミッドに従い、Unit を厚く、E2E を薄く保つ。

```
        /  E2E  \         ← 少数: 主要ユーザーフロー + リアルタイム同期
       /----------\
      / Integration \      ← 中程度: DB操作、API結合
     /----------------\
    /      Unit        \   ← 多数: ロジック、バリデーション、コンポーネント
```

詳細は各 rules ファイル（frontend.md, backend.md）を参照。

## CI (GitHub Actions)

### ci.yml — push to main / pull_request

frontend-ci と backend-ci を**並列ジョブ**で実行。各ジョブ内は lint → test の順で直列（lint 失敗で早期終了）。

| Job | Steps |
|-----|-------|
| frontend-ci | Biome (lint + format) → tsc (型チェック) → Vitest (unit test) |
| backend-ci | golangci-lint → go test (unit) → testcontainers + PG (integration) |

### e2e.yml — pull_request (main へのマージ時のみ)

backend + DB (testcontainers) + frontend を起動し、Playwright で E2E テストを実行。実行コストが高いため main への PR 時のみに限定する。

## ブランチ・Issue・PR の運用

### フロー

| Step | 作業 | 担当 |
|------|------|------|
| 1 | やりたいことを提示 | ユーザー |
| 2 | 意図の深堀り・goal 提案 | Claude |
| 3 | goal 合意 → GitHub Issue 作成 | Claude |
| 4 | Issue ベースでブランチ作成 | Claude |
| 5 | 作業開始、早期に Draft PR 作成 | 協業 |
| 6 | goal 変更時は Issue を更新 | 都度 |
| 7 | PR マージで Issue 自動クローズ | Claude |

### ルール

- ブランチ名: `{issue番号}-{概要}`（例: `4-stock-item-crud`）
- PR 本文に `Closes #N` を記載し、マージ時に Issue を自動クローズする
- 作業が長期化する場合は Draft PR を早めに作成し、CI 実行と進捗の可視化に活用する

## 旧仕様の参照

旧製品の仕様は `specs/old-product.md` を参照。新製品で再現すべき機能の原典となる。

## 開発フロー

TypeScript / Go の実装はユーザーがメインで記述する（言語・FW の学習目的）。各機能は以下の TDD ベースのフローで進める。

| Step | 作業 | 担当 |
|------|------|------|
| 1 | 機能の洗い出し（コンポーネント、API、DB） | ユーザー → Claude |
| 1.5 | インターフェース設計（型、スキーマ定義） | Claude が草案 → ユーザーがレビュー |
| 2 | テストケース設計 | Claude が作成 → ユーザーがレビュー |
| 3 | テスト実装 | Claude が方針提示 → ユーザーが実装 → Claude がレビュー |
| 4 | プロダクションコード実装 | ユーザーが実装 → Claude がレビュー |
| 4.5 | 動作確認（サーバー起動、手動テスト） | ユーザーが実施 |
| 5 | リファクタリング | 協業（観点を事前に明示） |

### 各ステップの補足

- **Step 1.5**: API のリクエスト/レスポンス型、コンポーネントの props/state 型、DB テーブルスキーマを先に定義する。テスト設計の前提を明確にするため。
- **Step 3**: Claude はテストで使うべきライブラリ、アサーション手法、モック手法を提示する。ユーザーがテストコードを書くことで言語・FW の学習効果を高める。
- **Step 4**: Claude はレビュー時に、利用すべき言語・FW 機能も提案する。
- **Step 4.5**: ユニットテストでは検出できない問題（WebSocket 接続、CORS、DB 接続など）を手動で確認する。
- **Step 5**: リファクタリングの観点 — 命名の一貫性、責務の分離、エラーハンドリングの網羅性、テストの可読性。

### Claude の提案ルール

- 可能な限り複数の選択肢を提示する
- 複数提案がある場合、理由付きで最も推奨する選択肢を明示する

### 動作確認の環境

- 当面はローカルの作業環境でサーバー起動などを行い動作確認する
- 将来的には Docker Compose やAWS 上の preview 環境を用意し、環境依存を減らす
