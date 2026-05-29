## MODIFIED Requirements

### Requirement: Backend は AWS Lambda Function として実行できる
Backend のコンテナイメージは AWS Lambda の container image source として実行できる SHALL。Lambda 環境では LWA が自動的に Echo の前段に入り、Lambda invocation を HTTP リクエストに変換する。タイムアウトが発生した場合は Lambda の 30 秒 hard kill 前に 503 レスポンスを返す MUST。

#### Scenario: Lambda 上で /health が応答する
- **WHEN** Lambda Function を作成しコンテナイメージを設定する
- **AND** Function URL を有効化して URL を叩く
- **THEN** `/health` が 200 + `{"db":"connected","status":"ok"}` を返す

#### Scenario: Lambda でタイムアウトが発生した場合 503 を返す
- **WHEN** リクエスト処理が 25 秒以上かかる
- **THEN** Lambda の 30 秒強制終了前に 503 Service Unavailable が返る
- **AND** クライアントはエラーレスポンスを受信できる（接続が突然切れない）
