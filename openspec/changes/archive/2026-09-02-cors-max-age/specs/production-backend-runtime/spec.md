## ADDED Requirements

### Requirement: preflight レスポンスに Access-Control-Max-Age を設定する
Backend の Echo CORS ミドルウェアは、preflight (`OPTIONS`) レスポンスに `Access-Control-Max-Age: 7200` ヘッダーを含める SHALL。この値はブラウザが preflight 結果をキャッシュできる期間(秒)を示す。

#### Scenario: preflight リクエストに Access-Control-Max-Age が含まれる
- **WHEN** クライアントが許可された origin から preflight (`OPTIONS`) リクエストを送信する
- **THEN** レスポンスの `Access-Control-Max-Age` ヘッダーが `7200` である

#### Scenario: 許可されていない origin からの preflight には CORS ヘッダーが付かない
- **WHEN** クライアントが `CORS_ALLOWED_ORIGINS` に含まれない origin から preflight リクエストを送信する
- **THEN** レスポンスに `Access-Control-Allow-Origin` も `Access-Control-Max-Age` も含まれない(既存の origin 許可ロジックは変更されない)
