## ADDED Requirements

### Requirement: Health endpoint returns system status
フロントエンドは `GET /api/health` エンドポイントを提供し、フロントエンド自身の稼働状態と Go バックエンドへの疎通結果を JSON で返す SHALL。

#### Scenario: Both frontend and backend are healthy
- **WHEN** GET /api/health にリクエストが来て、Go バックエンドの /health が 200 を返す
- **THEN** `{ "status": "ok", "backend": { "status": "ok" } }` を HTTP 200 で返す

#### Scenario: Backend is unreachable
- **WHEN** GET /api/health にリクエストが来て、Go バックエンドへの接続がタイムアウトまたは失敗する
- **THEN** `{ "status": "degraded", "backend": { "status": "error", "message": "<エラー内容>" } }` を HTTP 200 で返す

#### Scenario: Request timeout
- **WHEN** Go バックエンドへの疎通確認が 5 秒以内に完了しない
- **THEN** バックエンドを `error` 状態としてタイムアウト扱いにし、HTTP 200 で degraded を返す

### Requirement: Health endpoint is publicly accessible
`/api/health` は認証なしでアクセスできる SHALL。GitHub Actions からトークンなしで叩けることが前提。

#### Scenario: Unauthenticated access
- **WHEN** 認証ヘッダーなしで GET /api/health にリクエストが来る
- **THEN** 認証エラーなくレスポンスを返す
