## 1. GitHub Issue とブランチを作成する

- [x] 1.1 GitHub Issue を作成する（タイトル: "refactor(backend): slog, golangci.yml, timeout middleware, apierror package"）
- [x] 1.2 Issue 番号を使ってブランチを作成する（例: `{N}-backend-best-practice`）

## 2. apierror パッケージを作成する

- [x] 2.1 `backend/apierror/apierror.go` を新規作成する（`ErrorResponse{Message, Detail}` 型を定義）
- [x] 2.2 `backend/handler/stock_item.go` の `ErrorResponse` 型を削除し、`apierror.ErrorResponse` を使うよう書き換える
- [x] 2.3 `backend/handler/group.go` と他のハンドラファイルも同様に `apierror.ErrorResponse` を使うよう書き換える
- [x] 2.4 `backend/middleware/auth.go` の `map[string]string{"message": "..."}` を `apierror.ErrorResponse{Message: "..."}` に書き換える
- [x] 2.5 `go test ./...` でテストが pass することを確認する

## 3. slog 構造化ログを導入する

- [x] 3.1 `backend/main.go` の冒頭（`main()` 先頭）に `slog.SetDefault(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))` を追加する
- [x] 3.2 `main.go` の全 `log.Println` / `log.Fatal` を `slog.Info` / `slog.Error` + `os.Exit(1)` に置き換える（`log.Fatal` は `slog.Error` + `os.Exit(1)` で代替）
- [x] 3.3 他のファイルに `log.*` が残っていないか確認し、あれば `slog.*` に置き換える
- [x] 3.4 `go build ./...` が成功することを確認する

## 4. .golangci.yml を作成する

- [x] 4.1 `backend/.golangci.yml` を新規作成する（govet / errcheck / staticcheck / goimports / revive / gosimple を有効化）
- [x] 4.2 `cd backend && golangci-lint run ./...` を実行して lint エラーが 0 件であることを確認する
- [x] 4.3 lint エラーがある場合は修正する（ただし動作変更を伴うものは別 Issue に先送りせず、リファクタ範囲内で修正する）

## 5. timeout middleware を追加する

- [x] 5.1 `backend/main.go` に `middleware.TimeoutWithConfig(middleware.TimeoutConfig{Timeout: 25 * time.Second})` を追加する（全ルートに適用、CORS の後に設定）
- [x] 5.2 `go test ./...` でテストが pass することを確認する（特に integration tests）

## 6. テスト・品質チェック

- [x] 6.1 `go test ./...` で全テストが pass することを確認する
- [x] 6.2 `go build ./...` が成功することを確認する
- [x] 6.3 `cd backend && golangci-lint run ./...` が lint エラー 0 件であることを確認する

## 7. PR を作成して CI を確認する

- [ ] 7.1 変更をコミット・push して PR を作成する（`Closes #N` を本文に含める）
- [ ] 7.2 `gh pr checks --watch` で CI が pass することを確認する
