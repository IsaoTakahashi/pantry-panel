## Context

背景は proposal.md の「Why」を参照。`backend/middleware/auth.go` の `NewJWTAuth` は、`jwt.Parse` のエラーをすべて 401 にしている。keyfunc v3.8.2 の `Keyfunc` は、ストレージから鍵を読めないとき取り直し（refresh）を試み、失敗すると `errors.Join(err, ErrKeyfunc)` を返す。jwkset の `ErrKeyNotFound` がそのエラーに含まれるのは、実際に取り直しを行ったそのリクエストだけである。障害中の 2 回目以降のリクエストは、取り直しの制限（rate limiter）待ちで失敗し、`ErrKeyNotFound` を含まない。そのため `errors.Is` だけでは判別できない（却下した当初の D1 の前提。D1「経緯」と e2e-design.md「前提」を参照）。D1 が先に鍵ストアを引くのはこのためである。

## Goals / Non-Goals

**Goals:**
- 「鍵を解決できない」を 503 にして、page が強制ログアウトの理由にしないようにする

**Non-Goals:**
- keyfunc の起動時の挙動（`NoErrorReturnFirstHTTPReq`）や取り直しの頻度の変更
- `/stock-items` 以外のフロントの経路の変更

## Decisions

### D1: 鍵ストアを先に引くラッパーで「鍵を解決できない」を判別する
- `jwt.Keyfunc` を薄いラッパーで包む。トークンのヘッダーに文字列の `kid` があれば、まず `keyfunc.Keyfunc.Storage().KeyRead(ctx, kid)` で鍵ストアを直接読む。読めなければ（JWKS の取得失敗、取り直しの制限待ち、未知の kid のいずれでも）、独自の sentinel エラー（例: `ErrSigningKeyUnavailable`）で包んで返す。読めたときだけ、元の keyfunc に検証（alg・use の照合と鍵の返却）を任せる
- `NewJWTAuth` は `errors.Is(err, ErrSigningKeyUnavailable)` のとき 503、それ以外の `jwt.Parse` のエラーは 401
- `kid` が無い、または文字列でないトークンは、ラッパーは何もせず元の keyfunc に渡す（従来どおり 401）。Supabase の非対称鍵のトークンには必ず kid が付く
- 経緯: 当初は `errors.Is(err, jwkset.ErrKeyNotFound)` だけで判別する案だった。しかしテスト設計で keyfunc の実物を使って再現したところ、障害中の 2 回目以降のリクエストは取り直しのレートリミッター（5 分に 1 回、`RateLimitWaitMax` 1 分）の待ちで即失敗し、そのエラーは `ErrKeyNotFound` を含まず判別の目印が無かった（e2e-design.md「前提」）
- 却下した案:
  - `errors.Is(err, keyfunc.ErrKeyfunc)` 全体を 503 にする → alg 不一致などトークン側の不備まで 503 になり、不正なトークンでログアウトさせられなくなる
  - レートリミッターや `RateLimitWaitMax` の設定を変える → 障害中に Supabase への取り直しが増え、未知の kid を送りつけて取り直しを外から増幅できてしまう
  - エラーメッセージの文字列で判別する → ライブラリの更新で黙って壊れる
- ラッパーは鍵ストアを 2 回読む（ラッパーと元の keyfunc）。2 回目はキャッシュから返るので通信は増えない

### D2: page 側は既存の「401 以外の失敗 → null」に乗る
- `getInitialStockItems` は `HttpError.status === 401` だけを分岐しているので、503 は自動的に `null`（ログアウトしない）になる。挙動を固定するため、503 のテストを明示的に足す

### D3: 503 のレスポンス本文
- 既存の `apierror.ErrorResponse` 形式で `{"message": "Service Unavailable"}` を返す。鍵を解決できない理由（未知の kid か、JWKS の取得失敗か、取り直しの制限待ちか）はレスポンスに出さず、`slog` でログに出す

## Risks / Trade-offs

- [攻撃者が未知の kid のトークンを送ると 503 になる] → 在庫は返らず、ログアウトもしない。JWKS の取り直しは keyfunc の制限（5 分に 1 回）を超えて増えない。ログに残るので観測できる
- [期限内だが、Supabase が JWKS から外した鍵（失効・ローテーションで消えた鍵）で署名されたトークンは、「未知の kid」として 401 ではなく 503 になり、強制ログアウトされない] → Next の middleware は期限内のトークンを `/stock-items` でネットワークなしに通すので、そのユーザーはアクセストークンが期限切れになるまでエラー表示になり、その後は通常の更新で回復する。在庫データは返らないので、許容する
- [鍵ローテーション直後に、新しい kid の正規トークンが最大 5 分ほど 503 になる] → 以前は 401 で強制ログアウトされていたので、エラー表示で済む今回のほうが影響は小さい
