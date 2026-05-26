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

Unit を厚く、Integration 中程度、E2E を薄く保つ（テストピラミッド）。スコープ定義・選択基準・テスト設計フォーマットの詳細は `.claude/rules/testing.md` を参照。

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

## コンテキスト管理

- **Context 使用率 60% 以下**を維持する。60% を超えそうになったら、調査・探索タスクは subagent に委譲して main context を清潔に保つ
- 「長い会話の後半で指示が守られない」と感じたら Context 肥大化のサイン。その場合は `/compact` を使うか新セッションに切り替える
- subagent を使うべきタイミング: コードベース探索・ファイル検索・情報収集など、結果だけ受け取れば十分な作業

## 設計・変更管理ワークフロー

要件探索から実装完了まで、以下のツールを組み合わせて進める。

| フェーズ | ツール | タイミング |
|---------|--------|-----------|
| 設計・探索 | `superpowers:brainstorming` | 要件が曖昧・UIの視覚比較が必要なとき |
| 変更登録・タスク化 | `opsx:propose` | 設計が固まったら openspec の change として登録。**完了後すぐに GitHub Issue + Draft PR を作成する** |
| テスト設計 | **テスト設計 sub-agent** | proposal.md の「ユーザーシナリオとテスト設計」セクションを作成する（`.claude/rules/testing.md` のフォーマット参照）→ ユーザーがレビュー |
| 実装 | `opsx:apply` + **実装 sub-agent** (`superpowers:subagent-driven-development`) | tasks.md を元に実装 sub-agent を派遣。各 sub-agent は `superpowers:test-driven-development` で TDD（Red-Green-Refactor）を実施。**commit のたびに push し、PR 上の CI で常に最新状態を確認できるようにする** |
| ローカルE2E確認 | — | すべての実装完了後・push前に `cd frontend && npx playwright test` でローカルE2Eを実行してpassを確認する。**UIコンポーネント（モーダル・アニメーション）を変更した場合は必須**。dev server (`npm run dev`) が起動している状態で実行すること |
| コードレビュー | **コードレビュー sub-agent** | 実装完了後、変更差分をレビューする → ユーザーが最終確認 |
| CI 確認 | — | ローカルE2E確認後、`gh pr checks --watch` で PR 上の CI 結果を確認。失敗があれば原因を調査して修正する |
| 完了処理 | `opsx:archive` | **PR マージ前**に実施。specs 同期・アーカイブのコミットも同じ feature ブランチに含める。加えて: (1) proposal.md のユーザーシナリオを関連 spec.md へ昇格、(2) レビューで確定した判断基準を `testing.md` の更新ログに追記 |

設計が明確な場合は brainstorming を省略して `opsx:propose` から始めてよい。

## 開発フロー

各機能は以下の TDD ベースのフローで進める。実装は `superpowers:subagent-driven-development` で subagent に委譲し、各 subagent は `superpowers:test-driven-development` に従う。ユーザーはレビューと意思決定を担当する。

| Step | 作業 | 担当 |
|------|------|------|
| 1 | 機能の洗い出し（コンポーネント、API、DB） | ユーザー → Claude |
| 1.5 | インターフェース設計（型、スキーマ定義） | Claude が草案 → ユーザーがレビュー |
| 2 | ユーザーシナリオ定義 + テスト設計 | **テスト設計 sub-agent** が作成 → ユーザーがレビュー |
| 3 | 実装（TDD: Red-Green-Refactor） | `superpowers:subagent-driven-development` で**実装 sub-agent** に委譲。各 sub-agent は `superpowers:test-driven-development` に従いテスト → 実装 → リファクタリングを一体で回す。**commit のたびに push し PR 上の CI を最新状態に保つ** → ユーザーがレビュー |
| 3.5 | ローカルE2E確認 | 全タスク完了後・push前に `cd frontend && npx playwright test` を実行してpassを確認する。UIコンポーネント（モーダル・アニメーション）を変更した場合は必須 |
| 3.6 | コードレビュー | **コードレビュー sub-agent** が変更差分をレビュー → ユーザーが最終確認 |
| 3.7 | CI 確認 | ローカルE2E確認後、`gh pr checks --watch` で PR 上の CI 結果を確認。失敗があれば調査・修正する |
| 4 | 動作確認（サーバー起動、手動テスト） | Claude Code が実施 → ユーザーが最終確認 |

**Step 2 の詳細（テスト設計 sub-agent が担当）:**

- **ユーザーシナリオ**（日本語）を列挙する。フロントエンド（ユーザー操作）とバックエンド（API契約）でセクションを分ける
- **テスト設計**は `.claude/rules/testing.md` のハイブリッドフォーマットで行う：サマリテーブル + 各シナリオの G/W/T + スコープ別検証観点
- 各シナリオについて **E2E判定**（Yes/No）と**理由**を明記する。E2E Mock / Preview の区別も判断ツリーに従って決定する
- レビューでスコープ変更が承認された場合は `testing.md` の判断基準更新ログに追記する

### 直接の修正依頼（opsx フロー外）の扱い

ユーザーから「〜を直してください」のような直接の修正依頼が来た場合も、原則として sub-agent を使う。

- **実装前に確認する**: 変更が小さいと判断した場合でも、「小さいので main 会話で直接実装します」と勝手に決めず、**必ずユーザーに確認してから** sub-agent を省略してよいかを決める
- **規模の目安（確認なしに sub-agent を省略できる下限はない）**: 1 ファイル・数行の変更でも確認を行う

### Claude の提案ルール

- 可能な限り複数の選択肢を提示し、理由付きで推奨を明示する
