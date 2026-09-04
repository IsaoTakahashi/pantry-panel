# pantry-panel

家庭の食品・日用品の在庫を管理する Web アプリ。

## 機能

| 機能 | 説明 |
|------|------|
| 商品一覧・CRUD | 在庫アイテムの表示・登録・編集・削除 |
| 買い物リスト | wantToBuy トグルで購入予定を管理 |
| フィルタリング | テキスト検索・カテゴリ・買い物リストで絞り込み |
| リアルタイム同期 | Supabase Realtime で家族間の変更をリアルタイム反映 |
| シンプルビュー | 表示モード切り替えでコンパクト表示 |
| 商品画像設定 | Google 画像検索から商品画像を選択・設定 |
| URL 商品登録 | 商品ページの URL から名前・画像を自動抽出して登録 |
| Google 認証 | Supabase Auth で Google OAuth ログイン |
| グループ管理 | グループ単位でデータを分離・招待リンクでメンバー追加 |

## 技術スタック

| 役割 | 技術 |
|------|------|
| Frontend | Next.js (TypeScript) / Vercel |
| Backend API | Go (Echo) / AWS Lambda + Lambda Web Adapter |
| Database | Supabase Postgres (Supavisor Session Pooler) |
| Realtime | Supabase Realtime（Frontend が直接購読） |
| 認証 | Supabase Auth（Google OAuth） |

詳細は `.claude/rules/` および `specs/features.md` を参照。

## 開発フロー

### ローカル起動

```bash
# DB (Postgres)
docker compose up -d

# Backend (Echo, port 8080)
cd backend
cp .env.local.example .env.local  # 初回のみ
go run .

# Frontend (Next.js, port 3000)
cd frontend
cp .env.local.example .env.local  # 初回のみ
npm run dev
```

ブラウザで http://localhost:3000 を開く。Supabase 環境変数が未設定でも REST CRUD は動作する（Realtime のみ無効）。

### Supabase 接続でのローカル動作確認

```bash
cd backend
export DATABASE_URL='postgresql://postgres.<ref>:<PASSWORD>@aws-*-ap-northeast-1.pooler.supabase.com:5432/postgres'
go run .
```

`.env.local`（git 管理外）にまとめておくと取り回しやすい。

## CI / Deploy

| ワークフロー | トリガ | 内容 |
|-------------|--------|------|
| `.github/workflows/ci.yml` | push / PR | frontend (lint + tsc + test) と backend (lint + test) を並列実行 |
| `.github/workflows/e2e.yml` | PR (main 向け) | Playwright E2E（Mock: localhost、外部 API stub） |
| `.github/workflows/e2e-preview.yml` | PR (main 向け) | Playwright E2E（Preview: Vercel Preview URL、外部 API 実使用） |
| `.github/workflows/deploy-backend.yml` | push to main (`backend/**`) / workflow_dispatch | OIDC で AWS 認証 → ECR ビルド/プッシュ → Lambda 更新 → smoke test |
| `.github/workflows/preview-backend.yml` | PR / workflow_dispatch | PR 専用 preview Lambda にデプロイして動作確認 |
| `.github/workflows/keep-warm.yml` | schedule (10 分ごと) | Lambda コールドスタート抑制のため `/health` を定期 ping |
| Frontend deploy | Vercel が GitHub 連携で自動 (main push) | — |

### Backend ロールバック手順

```bash
aws lambda update-function-code \
  --function-name pantry-panel-backend \
  --image-uri <ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/pantry-panel-backend:<old-sha>
aws lambda wait function-updated --function-name pantry-panel-backend
```

ECR Console で過去の sha タグから戻したいものを選ぶ。

## 本番環境

| 環境 | 説明 |
|------|------|
| Frontend | Vercel（URL は Vercel Dashboard で確認） |
| Backend | AWS Lambda + LWA（URL は GitHub Actions Variables `LAMBDA_FUNCTION_URL` で管理） |
| Database | Supabase Postgres（Supavisor Session Pooler 経由） |

## ドキュメント

- `specs/features.md` — Phase 別の機能ロードマップ・実装状況
- `specs/old-product.md` — 旧製品仕様（参照元）
- `.claude/rules/overview.md` — アーキテクチャ全体像
- `.claude/rules/backend.md` — Go / Lambda 関連
- `.claude/rules/frontend.md` — Next.js / Vercel 関連
- `openspec/changes/` — 進行中の変更提案
- `openspec/changes/archive/` — 過去の変更履歴

## ライセンス

MIT (see [LICENSE](LICENSE))



