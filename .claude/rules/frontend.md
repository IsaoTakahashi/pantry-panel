# Frontend

## 技術スタック

- **Next.js** (TypeScript)
- デプロイ先: AWS Amplify または CloudFront + S3

## API 連携

- REST API を使用して CRUD 操作を行う
- WebSocket 接続でリアルタイムにデータ変更を受信する

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
- vuexfire によるリアルタイムバインド → WebSocket による変更通知で再現
- Buefy (Bulma) → UI ライブラリは未定
