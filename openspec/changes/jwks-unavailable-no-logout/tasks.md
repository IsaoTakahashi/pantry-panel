## 1. Go API

- [x] 1.1 e2e-design.md の B-1〜B-3 を `backend/middleware/auth_test.go` に追加する。本物の keyfunc（`keyfunc.NewDefaultOverrideCtx` + `httptest` の JWKS サーバー）で組み、JWKS の障害が続くときの連続 3 回がすべて 503、未知の kid の連続 2 回が 503、署名不正・alg 不一致などが 401 であることを確かめる。実装前に B-1 の 2 回目以降が RED になることを確認する
- [x] 1.2 design.md D1 のラッパー（鍵ストアを先に引き、読めなければ `ErrSigningKeyUnavailable` で包む）を実装し、`main.go` で `keyfunc` をラップして `NewJWTAuth` に渡す。`NewJWTAuth` は `errors.Is(err, ErrSigningKeyUnavailable)` で 503（`{"message": "Service Unavailable"}`）を返し、理由を `slog` に出す。`go test ./...` と golangci-lint が通ることで確認する

## 2. フロントエンド

- [x] 2.1 `frontend/src/app/stock-items/getInitialStockItems.test.ts` に、Go API が 503 を返したとき（トークンは期限内）`redirect` を呼ばず `null` を返すテストを追加する。テストが通ることで確認する（実装は既存の「401 以外 → null」で満たされる見込み。満たされなければ実装を直す）

## 3. 回帰確認

- [ ] 3.1 ローカルで `cd frontend && npx playwright test --project=mock` が通ること（Go バックエンドを起動して実行し、終わったら止める）、PR の CI が通ることを `gh pr checks` で確認する

## 4. マージ後の確認

- [ ] 4.1 本番で `/api/stock-items` 等が正常に 200 を返すこと、Vercel の `get_runtime_errors` に新しいエラーが増えていないことを確認する
