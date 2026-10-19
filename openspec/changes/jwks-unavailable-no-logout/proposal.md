## Why

#306（PR #308）で、`/stock-items` のトークン検証は Go API が担う構成になった。page は Go API から 401 が返り、かつアクセストークンが期限内なら、cookie を消して `/login` へ送る。

Go API の JWKS 取得（`backend/main.go` の `keyfunc.NewDefaultOverrideCtx`）は、keyfunc v3.8.2 の既定値で `NoErrorReturnFirstHTTPReq = true` になっている。そのため Lambda の起動時に JWKS の取得に失敗しても、鍵が空のまま起動する。未知の kid での取り直しは 5 分に 1 回までに制限されている。起動時の取得と直後の取り直しがどちらも失敗すると（Supabase Auth の障害時など）、正規のトークンでも 401 になり、ログイン済みのユーザーが強制ログアウトされる（Issue #309）。#308 以前は fail open（エラー表示のみ）だった。

## What Changes

- Go API の JWT 認証ミドルウェアは、検証用の鍵を解決できない（keyfunc がストレージから鍵を読めない＝`jwkset.ErrKeyNotFound`）場合に、401 ではなく **503** を返す。署名が不正なトークン、期限切れ、kid や alg が無いなど、トークン自体の問題は今までどおり 401
- page（`getInitialStockItems`）は 503 を受けたとき、`/login` へ送らずに `null` を返す（クライアント側の取得に任せる。今の「401 以外の失敗」と同じ扱い。明示的なテストを足す）
- `jwkset` を go.mod の直接依存にする（今は indirect）

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `ssr-session-auth`: 「/stock-items ではトークンの署名検証を Go API に委ねる」に、Go API が鍵を解決できないときは 503 を返し、page はそれをログアウトの理由にしないことを加える

## Impact

- コード: `backend/middleware/auth.go`（とテスト）、`backend/go.mod`、`frontend/src/app/stock-items/getInitialStockItems.test.ts`（503 のケース）。`getInitialStockItems.ts` は 401 以外を `null` にしているので、変更は不要の見込み
- Go API のすべての JWT 保護エンドポイントで、鍵を解決できないときのステータスが 401 から 503 に変わる。クライアント（`useStockItems` 等）は 401 を特別扱いしていないので、表示は今と同じエラーになる
- 攻撃者が未知の kid のトークンを送った場合も 503 になる。在庫データは返らず、ログアウトもしない。JWKS の取り直しは 5 分に 1 回の制限があるので、外部から取り直しを増幅させることはできない

## ユーザーシナリオとテスト設計

（テスト設計フェーズで test-design agent が作成する）
