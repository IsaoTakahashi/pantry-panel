## Context

背景は proposal.md の「Why」を参照。`backend/middleware/auth.go` の `NewJWTAuth` は、`jwt.Parse` のエラーをすべて 401 にしている。keyfunc v3.8.2 の `Keyfunc` は、ストレージから鍵を読めないとき `errors.Join(err, ErrKeyfunc)` を返し、その `err` には jwkset の `ErrKeyNotFound` が含まれる（JWKS が空のときも、未知の kid のときも同じ）。golang-jwt v5 の `jwt.Parse` は keyfunc のエラーを `ErrTokenUnverifiable` と一緒に包むので、`errors.Is` で判別できる。

## Goals / Non-Goals

**Goals:**
- 「鍵を解決できない」を 503 にして、page が強制ログアウトの理由にしないようにする

**Non-Goals:**
- keyfunc の起動時の挙動（`NoErrorReturnFirstHTTPReq`）や取り直しの頻度の変更
- `/stock-items` 以外のフロントの経路の変更

## Decisions

### D1: 503 にする条件は `errors.Is(err, jwkset.ErrKeyNotFound)` のみ
- keyfunc の他の `ErrKeyfunc`（kid が文字列でない、alg が無い、alg が鍵と合わない、use が許可外）は、トークンや鍵の内容の問題なので 401 のまま
- 代替案: `errors.Is(err, keyfunc.ErrKeyfunc)` 全体を 503 にする → トークン側の不備まで 503 になり、不正なトークンでログアウトさせられなくなるため不採用
- 代替案: JWKS が空かどうかを別途調べて 503 → keyfunc の内部状態に依存するうえ、未知の kid（鍵ローテーション直後）も同じく「鍵を解決できない」状態なので、`ErrKeyNotFound` で一括するほうが単純

### D2: page 側は既存の「401 以外の失敗 → null」に乗る
- `getInitialStockItems` は `HttpError.status === 401` だけを分岐しているので、503 は自動的に `null`（ログアウトしない）になる。挙動を固定するため、503 のテストを明示的に足す

### D3: 503 のレスポンス本文
- 既存の `apierror.ErrorResponse` 形式で `{"message": "Service Unavailable"}` を返す。鍵を解決できない理由（未知の kid か、JWKS の取得失敗か）はレスポンスに出さず、`slog` でログに出す

## Risks / Trade-offs

- [攻撃者が未知の kid のトークンを送ると 503 になる] → 在庫は返らず、ログアウトもしない。JWKS の取り直しは keyfunc の制限（5 分に 1 回）を超えて増えない。ログに残るので観測できる
- [鍵ローテーション直後に、新しい kid の正規トークンが最大 5 分ほど 503 になる] → 以前は 401 で強制ログアウトされていたので、エラー表示で済む今回のほうが影響は小さい
