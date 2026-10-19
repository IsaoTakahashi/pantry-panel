# ユーザーシナリオとテスト設計: jwks-unavailable-no-logout

## 前提（全シナリオ共通）

### 【対応済み】当初の D1 の条件だけでは、障害中の 2 回目以降のリクエストが 401 になる（design.md D1 をラッパー方式に改めた）

テスト設計の段階で、keyfunc v3.8.2 / jwkset v0.11.3 の実物を使って JWKS の障害を再現した（2026-10-19）。`errors.Is(err, jwkset.ErrKeyNotFound)` が真になるのは、**未知の kid で取り直しを実際に行った 1 回目のリクエストだけ**だった。続くリクエストは取り直しのレートリミッター（5 分に 1 回、`RateLimitWaitMax` の既定値は 1 分）の待ちで失敗する。このエラーは `keyfunc.ErrKeyfunc` で包まれているが `ErrKeyNotFound` を含まないので、D1 のままでは 401 になり、強制ログアウトが起きる。これは本 change が防ぎたい障害そのものである。

再現の手順（実装時に `auth_test.go` で組み立て直せるように書いておく）:

- `httptest.NewServer` で、常に 500 を返す JWKS サーバーを立てる
- `keyfunc.NewDefaultOverrideCtx(ctx, []string{srv.URL}, keyfunc.Override{})` で、本番（`backend/main.go`）と同じ既定値の keyfunc を作る。既定値の `NoErrorReturnFirstHTTPReq = true` により、鍵が空のまま生成に成功する
- RSA 鍵で署名し、ヘッダーに `kid` を入れた RS256 トークンを作り、`jwt.Parse(token, k.Keyfunc, ...)` を続けて 3 回呼ぶ
- 観測したエラー:
  - 1 回目: `token is unverifiable: error while executing keyfunc: key not found "k1" / failed keyfunc: could not read JWK from storage`。`ErrKeyNotFound` = true
  - 2・3 回目: `... failed to wait for JWK Set refresh rate limiter due to error: rate: Wait(n=1) would exceed context deadline / failed keyfunc: ...`。`ErrKeyNotFound` = false、`ErrKeyfunc` = true。所要時間は数 µs（待たずに即失敗する）
  - レートリミッターの待ちのエラーには、判別に使える sentinel が無い（`golang.org/x/time/rate` のエラーは `fmt.Errorf` の文字列だけ）
- `kid` の無いトークンを送ると `keyfunc returned empty verification key set` になる（`ErrKeyNotFound` ではない）。Supabase の非対称鍵のトークンには必ず `kid` が付くので、今回は対象外とする

**B-1 は当初の D1（`ErrKeyNotFound` だけで判別）の実装では RED になる。** レビュー（2026-10-19）で、鍵ストアを先に引くラッパーで判別する方式に design.md D1 を改めた。この方式でも B-1（503）と B-3（401）を両方満たすことを条件にする。

### テストの組み立て方

- **keyfunc を使うテストは、本物の keyfunc（`keyfunc.NewDefaultOverrideCtx` + `httptest` の JWKS サーバー）で組む。** `jwkset.ErrKeyNotFound` を直接返すスタブの `jwt.Keyfunc` や、静的な鍵ストア（`keyfunc.NewJWKSetJSON` 等）では、上のレートリミッターの経路を通らない。そのため B-1 の不備を見落とす（decision-log 2026-09-10「実際のメカニズムを再現しないと何も判別しない」と同じ構造）
- 既存の `auth_test.go` の `testKeyFunc`（HMAC 固定鍵）を使うテストは keyfunc を通らないので、そのまま残す。ただし、「keyfunc のエラーをすべて 503 にする」実装を防ぐ役には立たない。この防御は B-3 が担う
- page 側（`getInitialStockItems`）の `redirect` モックは、既存テストと同じく例外を投げるモックを使う（前回の change の前提を踏襲）
- E2E の環境は `mock` project（localhost:3000 + ローカルの Go API + E2E 用 Supabase）。Google CSE・Supabase Realtime は使わないので、判断ツリー Q2 は No（E2E Mock）

## フロントエンドシナリオ

### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | 期限内のトークンで Go API が 503 を返したとき、page は `/login` へ送らずクライアント側の取得に任せる | - | Unit |
| S-2 | 期限内だが署名が不正なトークンでは、今までどおり在庫が HTML に載らず、cookie が消されて `/login` に着地する（回帰） | Mock | E2E（既存 S-5） |

### S-1: 期限内のトークンで Go API が 503 を返したとき、page は `/login` へ送らずクライアント側の取得に任せる
**Given:** 期限内のアクセストークンを含むセッション cookie と activeGroupId cookie がある
**When:**  `/stock-items` の SSR で `getInitialStockItems()` が呼ばれ、`fetchStockItems()` が `HttpError(503)` を投げる
**Then:**  `getInitialStockItems()` は `null` を返す。`redirect()` は呼ばれず、cookie を消す経路（`/auth/clear-session`）にも行かない。`console.error` に失敗が記録される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`getInitialStockItems.test.ts`） | 既存の「401 以外の失敗は null（redirect しない）」の `it.each` に `["503", new HttpError(503)]` を足す。トークンは `exp` が未来のものを使う。`null` を返し、`redirect` モックが呼ばれないこと。`console.error` に `fetchStockItems failed, returning null` が出ること | 既存の実装（`status === 401` だけを分岐）で GREEN になる見込み。RED を経ずに GREEN になるのは想定どおり（挙動を固定するためのテスト）。`exp` が期限内であることが肝心。期限切れのトークンだと、401 の分岐を誤って 503 に広げた実装でも `null` になってしまい、区別できない |

**E2E判定:** No
**理由:** 判断ツリー Q1 = No。page と Go API の間は HTTP のステータスコードだけでつながっていて、「API レスポンス形式が固定」の代替条件にあたる。503 を返すことは B-1・B-2 が、503 を受けて `null` を返すことはこの Unit が担保する。E2E でローカルの Go API の JWKS を障害状態にすると、同じ Go API を通す在庫の seed（`seedItem`）も壊れる。そのため Go API を障害用の設定で別に起動する必要があり、コストに見合わない。`null` を受けたあとのクライアント側の取得とエラー表示は、既存の `useStockItems` のテストが担保している（クライアントは 401 を特別扱いしていないので、503 でも表示は変わらない）

---

### S-2: 期限内だが署名が不正なトークンでは、今までどおり在庫が HTML に載らず、cookie が消されて `/login` に着地する（回帰）
**Given:** `exp` は期限内で、署名部だけを書き換えたアクセストークンを含むセッション cookie と、有効な activeGroupId cookie を持っている。トークンの `kid` は Go API の JWKS に存在する
**When:**  `/stock-items` にアクセスする
**Then:**  Go API は 503 ではなく 401 を返す。page は `/auth/clear-session` へリダイレクトし、cookie が失効して `/login` に着地する。在庫データは応答のどこにも含まれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock（既存 `ssr-stock-items.spec.ts` の S-5） | 変更しない。tasks 3.1 のローカル実行と PR の CI で、そのまま通ることを確認する | 書き換えたのは署名部だけなので、`kid` は実在する。Go API の 503 の条件が広すぎる（署名不正まで 503 にする）と、この E2E が `/login` に着地せず RED になる |
| Backend Unit | B-3 を参照 | Go API の判別は B-3 で直接見る |

**E2E判定:** Yes（E2E Mock。既存の S-5 を回帰テストとして使い、新しい spec は足さない）
**理由:** 判断ツリー Q1 = Yes。アンチゴールの「不正なトークンでログアウトさせられなくなる」は、実際の Go API の署名検証 → page → Route Handler → ブラウザの cookie ストアというつながりの結果として起きる。このつながりは、前回の change で S-5 として E2E にしてある。今回の変更（Go API の 401/503 の分け方）はこのつながりの入口を変えるので、S-5 がそのまま判別に使える。Q2 = No なので Mock

---

## バックエンドシナリオ

### サマリ
| # | シナリオ | スコープ |
|---|---------|---------|
| B-1 | JWKS を取得できない状態が続くとき、正しく署名されたトークンでの連続したリクエストがすべて 503 になる | Backend Unit |
| B-2 | JWKS は取得できるが未知の kid のトークンのとき、連続したリクエストがすべて 503 になる | Backend Unit |
| B-3 | 鍵は解決できるがトークンや鍵の内容に問題があるとき、401 のまま | Backend Unit |
| B-4 | トークンの形式・期限の問題は、今までどおり 401 | Backend Unit |

### B-1: JWKS を取得できない状態が続くとき、正しく署名されたトークンでの連続したリクエストがすべて 503 になる
**Given:** 常に 500 を返す `httptest` の JWKS サーバーを指す、本番と同じ既定値の keyfunc（`keyfunc.NewDefaultOverrideCtx`、`Override{}`）を `JWTAuthConfig.KeyFunc` に渡す。`RequireGroup: true`、`GroupRepo` は所属を返すモック
**When:**  RSA 鍵で正しく署名し、`kid` 付き・`exp` は期限内の RS256 トークンで `GET /test`（`X-Active-Group-ID` 付き）を **3 回続けて** 送る
**Then:**  3 回とも 503 で、本文は `{"message": "Service Unavailable"}`。後続のハンドラは一度も呼ばれない。`GroupRepo` も呼ばれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit（`middleware/auth_test.go`） | 各リクエストのステータスが 503、本文が `apierror.ErrorResponse{Message: "Service Unavailable"}`、`handlerCalled == false`。2・3 回目が 401 になっていないこと | **D1 のままの実装では 2 回目で RED になる**（前提を参照）。スリープは不要（レートリミッターの待ちは即座に失敗する）。リクエストは 1 回目だけでは不十分で、2 回目以降がこのテストの本体 |

**E2E判定:** No
**理由:** 判断ツリー Q1 = No、Q3 = No。HTTP のリクエストとレスポンスを見れば足り、ブラウザは不要。JWKS の障害は `httptest` で決定的に再現できる

---

### B-2: JWKS は取得できるが未知の kid のトークンのとき、連続したリクエストがすべて 503 になる
**Given:** 鍵 A（`kid: "a"`）を含む JWKS を返す `httptest` サーバーを指す、本番と同じ既定値の keyfunc
**When:**  鍵 B で署名し `kid: "b"`（JWKS に無い）を付けたトークンで、`GET /test` を 2 回続けて送る
**Then:**  2 回とも 503。後続のハンドラは呼ばれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit（`middleware/auth_test.go`） | 2 回とも 503、`handlerCalled == false`。対照として、鍵 A で署名した `kid: "a"` のトークンは同じ keyfunc で 200 になる（fixture が正しく組めていることの確認） | 1 回目は取り直しをしても見つからない経路（`ErrKeyNotFound`）、2 回目はレートリミッターの経路を通る。鍵のローテーション直後の正規トークンと、攻撃者の未知の kid のトークンは、この経路で同じ扱いになる（design.md Risks） |

**E2E判定:** No
**理由:** B-1 と同じ

---

### B-3: 鍵は解決できるがトークンや鍵の内容に問題があるとき、401 のまま
**Given:** 鍵 A（`kid: "a"`）を含む JWKS を返す `httptest` サーバーを指す、本番と同じ既定値の keyfunc
**When:**  次のトークンで `GET /test` を送る
- (a) `kid: "a"` だが、鍵 A 以外の鍵で署名したトークン（署名が不正）
- (b) JWKS 側の鍵 A に `alg: "RS256"` を設定し、`kid: "a"` で `alg` が別（例: RS384 で署名）のトークン（keyfunc の `alg` 不一致エラー）
- (c) `kid` が文字列でない（例: 数値の）トークン
**Then:**  すべて 401。後続のハンドラは呼ばれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit（`middleware/auth_test.go`） | (a)〜(c) のそれぞれでステータスが 401、`handlerCalled == false` | (b)(c) は `keyfunc.ErrKeyfunc` を含むが `ErrKeyNotFound` は含まない。「`ErrKeyfunc` 全体を 503 にする」実装（design.md D1 で却下した案）を RED にする。B-1 の直し方を選ぶときも、B-3 を GREEN のまま保てるかが判断の条件になる。(b) で RS384 を許可リストに入れていない場合は、`jwt.WithValidMethods` の段階で弾かれ keyfunc を通らないので、許可リストにある alg の組み合わせ（例: JWK `alg: "RS256"` に対し ES256 で署名）を選ぶ |

**E2E判定:** No（Go API 単体では。通しの回帰は S-2 の既存 E2E）
**理由:** 判断ツリー Q1 = No。HTTP の入出力で完結する。ブラウザを通したときに不正なトークンでログアウトできることは、S-2（既存 S-5）が見る

---

### B-4: トークンの形式・期限の問題は、今までどおり 401
**Given:** 既存の `auth_test.go` の構成（HMAC の `testKeyFunc`）
**When:**  `Authorization` ヘッダーなし、JWT でない文字列、期限切れのトークン、別の鍵で署名したトークンで `GET /test` を送る
**Then:**  すべて 401。別の鍵で署名したトークンでは後続のハンドラが呼ばれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit（`middleware/auth_test.go`） | 既存の `no_header`・`invalid_token`・`expired_token`・`token_signed_with_other_key` を変更せずにそのまま通す | 新しいテストは足さない。503 の分岐を足しても、keyfunc を通らないエラーが 401 のままであることの回帰。実装で 503 の判定を `jwt.Parse` のエラー全般に広げていないことも、ここで見る |

**E2E判定:** No
**理由:** 判断ツリー Q1 = No。既存の Unit で足りる
