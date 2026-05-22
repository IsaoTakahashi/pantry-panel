## Why

Vercel にデプロイした Next.js フロントエンドのコールドスタートにより、散発的なアクセスが多い家族向けアプリで体感速度が低下している。PPR による静的シェルの即時配信とヘルスチェックによるウォームアップの両軸で改善する。

## What Changes

- Next.js に PPR (Partial Pre-rendering) を有効化し、静的シェルを CDN から即時配信する
- `/api/health` エンドポイントを追加し、フロントエンドの死活監視と Go バックエンドへの疎通確認を行う
- GitHub Actions のスケジュールジョブ（10分間隔）で `/api/health` を定期的に叩き、Vercel 関数をウォーム状態に維持する

## Capabilities

### New Capabilities

- `health-check`: `/api/health` エンドポイント。フロントエンド自身の稼働確認と Go バックエンドへの HTTP 疎通確認を返す
- `warmup-scheduler`: GitHub Actions スケジュールジョブ。`/api/health` を定期的に叩いて Vercel 関数をウォームに保つ
- `ppr-config`: Next.js PPR の有効化と Suspense 境界の設定

### Modified Capabilities

(なし)

## Impact

- `frontend/next.config.ts`: `experimental.ppr` を有効化
- `frontend/app/api/health/route.ts`: 新規追加
- `frontend/app/` 配下の Server Component: `<Suspense>` 境界を追加
- `.github/workflows/keep-warm.yml`: 新規追加
- GitHub Secrets: `VERCEL_APP_URL` の登録が必要
