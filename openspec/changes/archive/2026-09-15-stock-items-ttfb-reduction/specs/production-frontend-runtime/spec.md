## ADDED Requirements

### Requirement: Vercel serverless functionはバックエンドと同一リージョンで実行される
Frontendのserverless function（Node.jsランタイムで実行されるページのサーバーサイドレンダリング・Route Handlers）は、バックエンド(Go Lambda)およびデータベース(Supabase Postgres)と同一リージョン(`ap-northeast-1`、Vercelのregionコードで`hnd1`)で実行される SHALL。

#### Scenario: サーバーサイドで実行されるリクエストが東京リージョンで処理される
- **WHEN** `/stock-items` や `/api/health` など、Node.js serverless functionがサーバーサイドでSupabase・Go Lambdaへのネットワーク呼び出しを行うルートにリクエストが届く
- **THEN** レスポンスの `x-vercel-id` ヘッダーに含まれる実行リージョンが `hnd1` である
