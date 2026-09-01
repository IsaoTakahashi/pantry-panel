## 1. 実装

- [x] 1.1 `backend/main.go` の `middleware.CORSWithConfig(middleware.CORSConfig{...})` に `MaxAge: 7200` を追加する
- [x] 1.2 `backend/main_test.go` にテストを追加する:
  - 許可された origin からの preflight (`OPTIONS`) リクエストに対し `Access-Control-Max-Age: 7200` ヘッダーが返ることを検証する
  - 許可されていない origin からの preflight には `Access-Control-Allow-Origin` も `Access-Control-Max-Age` も含まれないことを検証する(既存の origin 許可ロジックへの副作用がないことの確認)
  - 実際の Echo インスタンス(`echo.New()` + 対象の `middleware.CORSWithConfig`)に対して `httptest` で `OPTIONS` リクエストを送る形で検証する(main.go の実際の設定を再利用するか、同一設定を構築するヘルパーを用意する)
- [x] 1.3 `cd backend && go test ./...` で green を確認する(`main` パッケージは green。`db`/`repository` パッケージの testcontainers 依存テストはこの環境で rootless Docker provider が無く既存の環境制約で失敗する。本変更と無関係)
- [x] 1.4 `cd backend && golangci-lint run` で lint clean を確認する(`0 issues.`)。mise 経由で解決されていた golangci-lint 2.11.4(go1.26.1 build)がローカル Go ツールチェイン go1.27.0 と噛み合わずパニックしたため、`mise install golangci-lint@2.13.2`(go1.27.0 build、mise.toml の `golangci-lint = "2"` 制約内)を実行して解消した

## 2. CI確認

- [x] 2.1 commit のたびに push し、PR 上の CI が最新状態であることを確認する
- [x] 2.2 `gh pr checks --watch` で CI が green になることを確認する(全チェックpass。PR #243)
