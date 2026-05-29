## ADDED Requirements

### Requirement: Backend が JSON 構造化ログを出力する
Backend は起動時に `slog.SetDefault` で JSON ハンドラを設定し、全ログを JSON 形式で stderr に出力する SHALL。ログには `time`, `level`, `msg` フィールドを含む MUST。

#### Scenario: 起動ログが JSON 形式で出力される
- **WHEN** Backend が正常起動する
- **THEN** 起動メッセージが JSON 形式（`{"time":"...","level":"INFO","msg":"..."}` 等）で stderr に出力される

#### Scenario: エラーログが JSON 形式で出力される
- **WHEN** DB 接続に失敗して Backend が終了する
- **THEN** エラーメッセージが JSON 形式で stderr に出力される

### Requirement: .golangci.yml でリンターを明示設定する
`backend/.golangci.yml` が存在し、有効なリンターセットを明示設定する SHALL。CI の golangci-lint-action はこのファイルを自動的に参照する MUST。

#### Scenario: .golangci.yml が存在する
- **WHEN** `ls backend/.golangci.yml` を実行する
- **THEN** ファイルが存在する

#### Scenario: golangci-lint がコードをパスする
- **WHEN** `cd backend && golangci-lint run ./...` を実行する
- **THEN** lint エラーが 0 件で終了する

### Requirement: ErrorResponse 型が共通パッケージで一元管理される
`handler` パッケージと `middleware` パッケージは同一の `ErrorResponse` 型を使用する SHALL。`apierror` パッケージを共通型置き場として使用する MUST。

#### Scenario: middleware のエラーレスポンスが handler と同じ JSON 形式
- **WHEN** 認証なしでリクエストを送信する
- **THEN** `{"message":"Unauthorized"}` 形式の JSON が返る（`handler` パッケージと同じ構造）
