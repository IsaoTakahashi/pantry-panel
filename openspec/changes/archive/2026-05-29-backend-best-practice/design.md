## Context

Go バックエンドは Echo v5 フレームワーク、AWS Lambda + LWA でデプロイ。現在:
- `main.go` が全ルーティング・DI・ミドルウェア設定を担う（145行）
- `log.Println`/`log.Fatal` のみ使用（標準 log パッケージ）
- `middleware/auth.go` が `map[string]string{"message": "..."}` でエラーを返す
- golangci-lint はデフォルト設定（CI に `.golangci.yml` 未参照）

## Goals / Non-Goals

**Goals:**
- CloudWatch Logs で JSON ログが検索・フィルタできるようになる
- Lambda の 30 秒 hard kill 前に 503 レスポンスを返せるようになる
- golangci-lint の有効リンターを明示化し、CI の再現性を確保する
- `ErrorResponse` 型を一箇所で管理し、handler/middleware 間の不一致を解消する

**Non-Goals:**
- ロガーをサードパーティ（zap, zerolog 等）に変更する（slog で十分）
- `main.go` のルーティングを別ファイルに分割する（今回はスコープ外）
- DB プール設定の Lambda 最適化（別 Issue）

## Decisions

### D1: slog の設定方法

`main()` の先頭で `slog.SetDefault` を呼ぶ。Handler は `slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})` を使用。

**理由:** Lambda は stderr を CloudWatch Logs に転送する。JSON 形式にすることで Logs Insights での `fields.msg`、`fields.level` によるフィルタが可能になる。

既存の `log.*` 呼び出し箇所（`main.go` の `log.Fatal`/`log.Println`）は `slog.*` に置き換える。`slog.SetDefault` を設定した後は `log.Println` も slog に転送されるが、明示的に置き換えてコードの一貫性を保つ。

### D2: ErrorResponse 共通パッケージ

`backend/apierror/apierror.go` を新設し `ErrorResponse` を定義する。

```go
package apierror

type ErrorResponse struct {
    Message string `json:"message"`
    Detail  string `json:"detail,omitempty"`
}
```

`handler` パッケージの `ErrorResponse` をこの型に置き換え、`middleware/auth.go` もこの型を使用する。

**循環依存を避ける理由:** `middleware` は `handler` を import しない（handler が middleware を import する向き）。共通パッケージに分離することで依存方向を一方向に保てる。

**代替案（却下）:** `middleware` が `handler` を import → 循環依存になる。

### D3: timeout middleware の設定

```go
e.Use(middleware.TimeoutWithConfig(middleware.TimeoutConfig{
    Timeout: 25 * time.Second,
}))
```

**25 秒の理由:** Lambda の最大タイムアウトは 30 秒。25 秒で timeout を返すことで、Lambda が強制終了する 5 秒前にクライアントへ 503 を返せる。

`/api/extract-from-url/stream`（SSE）はストリーミングなのでタイムアウト設定が競合する可能性があるが、Echo の TimeoutWithConfig は ResponseWriter が Write を始めた後はキャンセルしないため問題ない（実装確認済み）。

### D4: .golangci.yml の設定方針

有効にするリンター:
- `govet`: Go 標準の構造チェック
- `errcheck`: エラー戻り値の無視を検出
- `staticcheck`: 静的解析（SA*, S1*, QF* ルール）
- `goimports`: import 整理（CI の `go build` でも確認済みだが明示化）
- `revive`: Go 慣習違反の検出
- `gosimple`: コードの単純化提案

無効化するリンター（誤検知・このプロジェクト不要）:
- `exhaustruct`: フィールド全埋め強制（不要）
- `wrapcheck`: error wrap 強制（このプロジェクトでは不要）

## Risks / Trade-offs

- **slog 置き換えでログ形式が変わる** → CloudWatch Logs の既存クエリがあれば更新が必要。現状 Logs Insights でのクエリは特になし（運用初期のため）。
- **timeout middleware が `/stream` エンドポイントに影響する可能性** → 25 秒以内に Claude API + Jina が応答しない場合は timeout が発火する。現状 25 秒以内に完了することが多いため許容範囲。長時間リクエストの場合は後続 Issue でハンドラ固有の timeout を検討。
- **golangci.yml で新規 lint エラーが出る可能性** → `.golangci.yml` 追加後に初回 CI 実行で既存コードの lint エラーが検出されたら tasks.md に修正タスクを追加する。
