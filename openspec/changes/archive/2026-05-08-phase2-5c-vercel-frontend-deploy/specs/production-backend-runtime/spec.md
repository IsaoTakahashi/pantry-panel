## MODIFIED Requirements

### Requirement: Backend は CORS_ALLOWED_ORIGINS 環境変数で CORS 許可 origin を切り替える（既存）
Backend は `CORS_ALLOWED_ORIGINS`（カンマ区切り）を読み取り、Echo の CORS middleware の `AllowOrigins` に設定する SHALL。未設定時は `http://localhost:3000` を使用する MUST。**本番環境では Vercel の本番 URL を MUST 含める**。

#### Scenario: 単一 origin
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS=https://example.vercel.app` で起動する
- **THEN** `https://example.vercel.app` からのリクエストに `Access-Control-Allow-Origin: https://example.vercel.app` を返す

#### Scenario: 複数 origin
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS=https://a.vercel.app,https://b.vercel.app` で起動する
- **THEN** どちらの origin からのリクエストにも対応する CORS ヘッダを返す

#### Scenario: 未設定時はローカル用
- **WHEN** Backend を `CORS_ALLOWED_ORIGINS` 未設定で起動する
- **THEN** `http://localhost:3000` のみ許可する

#### Scenario: 本番では Vercel URL を含む
- **WHEN** Lambda の `CORS_ALLOWED_ORIGINS` 環境変数を確認する
- **THEN** Vercel 本番 URL（例: `https://pantry-panel-xxxxx.vercel.app`）が含まれる
