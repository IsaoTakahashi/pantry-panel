## ADDED Requirements

### Requirement: リクエストが 25 秒以内に完了しない場合 503 を返す
Backend は Echo の timeout middleware により、25 秒以内に完了しないリクエストに 503 Service Unavailable を返す SHALL。Lambda の 30 秒 hard kill より前にクライアントへエラーを返す MUST。

#### Scenario: 通常リクエストはタイムアウトしない
- **WHEN** `/health` に対して通常の速度でリクエストを送信する
- **THEN** 200 が返り、タイムアウトは発火しない

#### Scenario: 長時間リクエストはタイムアウトして 503 を返す
- **WHEN** 処理が 25 秒以上かかるリクエストを送信する
- **THEN** 503 Service Unavailable が返る
- **AND** Lambda の 30 秒タイムアウト前に応答が完了する
