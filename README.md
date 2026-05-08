# pantry-panel

家庭の食品・日用品の在庫を管理する Web アプリ。

## 技術スタック

| 役割 | 技術 |
|------|------|
| Frontend | Next.js (TypeScript) / Vercel |
| Backend API | Go (Echo) / AWS Lambda + Lambda Web Adapter |
| Database | Supabase Postgres (Supavisor Session Pooler) |
| Realtime (Phase 3.5) | Supabase Realtime（Frontend が直接購読） |

詳細は `.claude/rules/` および `specs/features.md` を参照。

## 開発フロー

### ローカル起動

```bash
# DB (Postgres 18)
docker compose up -d

# Backend (Echo, port 8080)
cd backend
export DATABASE_URL='postgres://pantry:pantry@localhost:5432/pantry_panel?sslmode=disable'
go run .

# Frontend (Next.js, port 3000)
cd frontend
npm run dev
```

ブラウザで http://localhost:3000/stock-items を開く。

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
| `.github/workflows/ci.yml` | push to main / PR | frontend (lint + tsc + test) と backend (lint + test) を並列実行 |
| `.github/workflows/e2e.yml` | PR (main 向け) | Playwright で E2E テスト |
| `.github/workflows/deploy-backend.yml` | push to main (`backend/**`) / workflow_dispatch | OIDC で AWS auth → ECR build & push → `lambda update-function-code` → smoke test |
| Frontend deploy | Vercel が GitHub 連携で自動 (main push) | `pantry-panel-xi.vercel.app` |

### Backend ロールバック手順

過去の任意の commit SHA（ECR タグ）に戻す:

```bash
aws lambda update-function-code \
  --function-name pantry-panel-backend \
  --image-uri <ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/pantry-panel-backend:<old-sha>
aws lambda wait function-updated --function-name pantry-panel-backend
```

ECR Console で過去の sha タグから戻したいものを選ぶ。

## 本番環境

| 環境 | URL |
|------|-----|
| Frontend | https://pantry-panel-xi.vercel.app (Vercel) |
| Backend | https://s6bvjds5bawebokitdmlq5g7oe0ptept.lambda-url.ap-northeast-1.on.aws (AWS Lambda + LWA) |
| Database | Supabase (`db.<ref>.supabase.co`、Lambda は Supavisor Session Pooler 経由) |

## ドキュメント

- `specs/features.md` — Phase 別の機能ロードマップ
- `specs/old-product.md` — 旧製品仕様（参照元）
- `.claude/rules/overview.md` — アーキテクチャ全体像
- `.claude/rules/backend.md` — Go / Lambda 関連
- `.claude/rules/frontend.md` — Next.js / Vercel 関連
- `openspec/changes/` — 進行中の変更提案
- `openspec/changes/archive/` — 過去の変更履歴

## ライセンス

MIT (see [LICENSE](LICENSE))
