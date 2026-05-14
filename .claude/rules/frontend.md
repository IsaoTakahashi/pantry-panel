# Frontend

## 技術スタック

- **Next.js** (TypeScript)
- デプロイ先: **Vercel**（無料枠で十分、Next.js native）
- 本番 URL: https://pantry-panel-xi.vercel.app

## API 連携

- REST API を使用して CRUD 操作を行う
- API ベース URL は `NEXT_PUBLIC_API_BASE_URL` 環境変数で切替え（未設定時は `http://localhost:8080`）
- リアルタイム購読（**本番ルート**）:
  - **Phase 3.5 (本番)**: Supabase Realtime クライアントで Postgres の変更を直接購読
  - Phase 3 の自前 WebSocket は学習目的のローカル / CI 動作確認のみ（本番には載せない）

## Vercel 設定

| 項目 | 値 |
|------|----|
| Framework Preset | **Next.js** （"Other" だと 404 になる） |
| Root Directory | `frontend` |
| Production Branch | `main` |
| Build Command | デフォルト (`next build`) |
| Output Directory | デフォルト |
| 環境変数 (Production / Preview / Development) | `NEXT_PUBLIC_API_BASE_URL` = Lambda Function URL, `NEXT_PUBLIC_SUPABASE_URL` = Supabase Project URL, `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Supabase anon key |

main へ push すると Vercel が自動デプロイ（GH Actions 不要）。

## ローカル開発時の env

```bash
cp frontend/.env.local.example frontend/.env.local
# NEXT_PUBLIC_API_BASE_URL: デフォルト http://localhost:8080
# NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY: Supabase Dashboard → Settings → API から取得
# 未設定でも REST CRUD は動作する。Supabase 未設定時はコンソールに warn が 1 度出て Realtime が無効になる
cd frontend && npm run dev
```

`.env.local` は git 管理外（`.gitignore` で除外、`.env.local.example` のみ track）。

## テスト

| レイヤー | ツール | 対象 |
|---------|--------|------|
| Unit | **Vitest** + **React Testing Library** | ロジック、hooks、コンポーネント描画 |
| Learning | **Vitest** (別 config) | `*.learning.test.{ts,tsx}` のみ。通常 vitest からは除外 |
| E2E | **Playwright** | ユーザー操作フロー、リアルタイム同期（複数 BrowserContext） |

## 学習用 WebSocket クライアント（Phase 3）

`frontend/src/learning/websocket-client/` に隔離。本番ビルドには影響しない。

| 項目 | 内容 |
|------|------|
| フック | `useStockItemsWebSocket(url): { lastEvent, readyState }` |
| 再接続 | exponential backoff（500ms → 1s → 2s → 5s → 10s 上限）。`computeBackoff` で計算 |
| メッセージ形式 | `{ type: "stock_items.created" \| "updated" \| "deleted", payload }` |
| テスト | `*.learning.test.{ts,tsx}` を `vitest.learning.config.ts` で実行（`npx vitest run --config vitest.learning.config.ts`） |
| playground | `frontend/src/app/learning/websocket-playground/page.tsx`（`.gitignore` 済、各自で書く） |

ローカル動作確認は backend の learning サーバー (`go run -tags=learning ./learning/cmd/server`) と組み合わせる。詳細は `.claude/rules/backend.md` の「Phase 3 学習実装の起動方法」を参照。

## Lint / Format

- **Biome** — ESLint + Prettier の代替。設定が最小限で高速。

## ドキュメント参照

| ツール | URL | 備考 |
|--------|-----|------|
| Next.js | https://nextjs.org/docs/llms-full.txt | llms-full.txt（AI 向け全文ドキュメント） |
| Biome | https://biomejs.dev/reference/configuration/ | 公式ドキュメント（llms.txt 未提供） |
| Tailwind CSS | https://tailwindcss.com/docs | 公式ドキュメント（llms.txt 未提供） |

## 旧製品からの移行ポイント

- Nuxt.js 2 (Vue 2) → Next.js (React) への移行
- vuexfire によるリアルタイムバインド → Supabase Realtime で再現（Phase 3 のみ自前 WebSocket を学習実装）
- Buefy (Bulma) → Tailwind CSS（旧プロダクトの teal カラーを再現済み。詳細は `openspec/specs/ui-style-guide/spec.md`）
