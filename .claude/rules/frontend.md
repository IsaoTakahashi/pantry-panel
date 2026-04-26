# Frontend

## 技術スタック

- **Next.js** (TypeScript)
- デプロイ先: **Vercel**（無料枠で十分。Next.js native）

## API 連携

- REST API を使用して CRUD 操作を行う
- リアルタイム購読:
  - Phase 3: Go バックエンドの自前 WebSocket に接続（学習目的、後に学習ログ化）
  - Phase 3.5 以降: **Supabase Realtime** クライアントで直接購読（本番）

## テスト

| レイヤー | ツール | 対象 |
|---------|--------|------|
| Unit | **Vitest** + **React Testing Library** | ロジック、hooks、コンポーネント描画 |
| E2E | **Playwright** | ユーザー操作フロー、リアルタイム同期（複数 BrowserContext） |

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
