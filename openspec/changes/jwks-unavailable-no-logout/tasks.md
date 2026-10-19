## 1. Go API

- [ ] 1.1 `backend/middleware/auth_test.go` に、鍵ストアに存在しない kid のトークンで 503 になり後続のハンドラが呼ばれないテストと、鍵ストアの鍵で検証できない署名のトークンが 401 のままであるテストを追加し、RED を確認する
- [ ] 1.2 `backend/middleware/auth.go` で `errors.Is(err, jwkset.ErrKeyNotFound)` のとき 503（`{"message": "Service Unavailable"}`）を返し、理由を `slog` で出す。`jwkset` を go.mod の直接依存にする。`go test ./...` と golangci-lint が通ることで確認する

## 2. フロントエンド

- [ ] 2.1 `frontend/src/app/stock-items/getInitialStockItems.test.ts` に、Go API が 503 を返したとき（トークンは期限内）`redirect` を呼ばず `null` を返すテストを追加する。テストが通ることで確認する（実装は既存の「401 以外 → null」で満たされる見込み。満たされなければ実装を直す）

## 3. 回帰確認

- [ ] 3.1 ローカルで `cd frontend && npx playwright test --project=mock` が通ること（Go バックエンドを起動して実行し、終わったら止める）、PR の CI が通ることを `gh pr checks` で確認する

## 4. マージ後の確認

- [ ] 4.1 本番で `/api/stock-items` 等が正常に 200 を返すこと、Vercel の `get_runtime_errors` に新しいエラーが増えていないことを確認する
