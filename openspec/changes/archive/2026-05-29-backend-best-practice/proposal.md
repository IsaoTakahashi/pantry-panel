## Why

Go バックエンドが `log.Println`/`log.Fatal` のみを使用しており、Lambda の CloudWatch Logs での構造化検索・フィルタが困難。また `.golangci.yml` がなく有効なリンターが不明確、Echo の timeout middleware がないため Lambda の 30 秒強制終了前に graceful なエラーレスポンスを返せない、`middleware/auth.go` が `handler` パッケージの `ErrorResponse` 型と異なる形式でエラーを返す不一致が存在する。

## What Changes

- `main.go` に `slog.SetDefault(slog.NewJSONHandler(os.Stderr, nil))` を追加し、全 `log.*` 呼び出しを `slog.*` に置き換える（Go 1.21+ 標準）
- `backend/.golangci.yml` を新規作成し、プロジェクトで使用するリンターセット（errcheck / govet / staticcheck / goimports 等）を明示設定する
- `main.go` に `middleware.TimeoutWithConfig(middleware.TimeoutConfig{Timeout: 25*time.Second})` を追加して Lambda タイムアウト前に 503 を返す
- `middleware/auth.go` の `map[string]string{"message": "..."}` を handler パッケージの `ErrorResponse` 型に統一する（循環依存回避のため共通パッケージ `apierror` を新設、または handler の型を使う）

## Capabilities

### New Capabilities

- `backend-observability`: 構造化ログ（slog JSON）と lint 設定（.golangci.yml）による観測性・コード品質の仕様
- `backend-timeout-middleware`: Lambda 対応の timeout middleware の仕様

### Modified Capabilities

- `production-backend-runtime`: タイムアウト動作の追加（graceful 503 before Lambda hard kill）

## Impact

- `backend/main.go` — slog 設定・timeout middleware 追加・log.* → slog.* 置き換え
- `backend/middleware/auth.go` — ErrorResponse 型を共通型に変更
- `backend/apierror/` — 新規パッケージ（ErrorResponse 型の共通化）
- `backend/.golangci.yml` — 新規ファイル
- 外部 API 変更なし
- ビルド・テスト影響: `go test ./...` が引き続きパスすること
