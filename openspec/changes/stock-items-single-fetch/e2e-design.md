# ユーザーシナリオとテスト設計: stock-items-single-fetch

## 前提（全シナリオ共通）

- 「Supabase と通信しない」「JWKS を取得しない」「Go API の呼び出しは 1 回」は、Unit では**モック境界の内側**（`getClaims` / `fetchStockItems` のモックが呼ばれたか）までしか言えない。`middleware.test.ts` は `createServerClient` を丸ごとモックしているため、`@supabase/ssr` 内部の通信は観測できない（`specs/testing-decision-log.md` 2026-09-11 と同じ構造）。実際の通信回数は tasks 8.1（本番の Vercel ランタイムログ）で確認する。Playwright からもサーバー間の fetch 回数は見えない
- Next.js の `redirect()` は例外を投げることで動く。Unit で `redirect` をモックするときは、**例外を投げるモック**（`NEXT_REDIRECT` 相当の値で throw）にする。何も投げないモックにすると、`try/catch` の中で redirect が握りつぶされて `null` が返る実装でも green になってしまう
- 既存の `middleware.test.ts` は、`getClaims` の挙動を検証するテストの多くが `/stock-items` に送っている（33 箇所）。`/stock-items` が `getSession()` に切り替わると、これらは「ほかの保護ルートの `getClaims` の挙動」を担保しなくなる。`/invite` などに送り先を変えるか、`/stock-items` 用に書き換えるかを仕分ける必要がある（S-9）
- 期限の判定は、page では cookie のアクセストークン本体（JWT payload）の `exp` だけを使う。`exp <= 現在時刻` を期限切れとする（境界はログアウトさせない側に倒す。レビューで決定、2026-10-18）
- E2E の環境は `mock` project（localhost:3000 の dev server + ローカルの Go API + E2E 用 Supabase）。今回使う外部 API は Supabase Auth と Go API だけで、Google CSE・Supabase Realtime は使わない。そのため判断ツリーの Q2 は No → E2E Mock

## フロントエンドシナリオ

### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | 期限内のセッションで `/stock-items` を開くと、middleware は通信せずに通し、在庫を先読みしない | - | Unit |
| S-2 | 期限切れのセッションで `/stock-items` を開くと、middleware が更新して新しい cookie を返す | - | Unit |
| S-3 | `/stock-items` で `getSession()` が失敗したとき、一時障害なら通し、確定的なエラー・セッションなしなら cookie を消して `/login` へ送る | - | Unit |
| S-4 | 件数の多いグループでも、page は Go API を 1 回だけ呼んで全在庫を返す | - | Unit |
| S-5 | 期限内だが署名が不正なトークンで開くと、在庫は HTML に載らず、cookie が消されて `/login` に着地する（ループしない） | Mock | E2E / Unit |
| S-6 | 期限切れのトークンで Go API が 401 を返したとき、ログアウトさせずにクライアント側の取得に任せる | - | Unit |
| S-7 | 403・5xx・タイムアウトのとき、`null` を返してクライアント側の取得に任せる（他人のグループの在庫は載らない） | - | Unit |
| S-8 | cookie を消して `/login` へ送る Route Handler | - | Unit |
| S-9 | `/stock-items` 以外の保護ルート（`/`・`/invite`・`/no-group`）は従来どおり `getClaims()` で判定する | - | Unit |
| S-10 | JS を無効にしても、初期 HTML に在庫が描画される（既存の回帰テスト） | Mock | E2E |
| S-11 | 区間ごとの所要時間と分岐の結果がログ・Server-Timing で区別できる。エラー型はステータスを持ち、メッセージは変わらない | - | Unit |

### S-1: 期限内のセッションで `/stock-items` を開くと、middleware は通信せずに通し、在庫を先読みしない
**Given:** 期限内のアクセストークンを含むセッション cookie と activeGroupId cookie を持っている
**When:**  `/stock-items` にアクセスする
**Then:**  middleware は `getSession()` だけで判定してリクエストを通す。`x-pp-authenticated: 1` を付ける。`getClaims()` と `fetchStockItems()` は呼ばない。`x-pp-initial-items` は付けない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`middleware.test.ts`） | `/stock-items` で `getSession` モックが呼ばれ、`getClaims` モックが呼ばれない。`fetchStockItems` モックが呼ばれない。下流の request headers に `x-pp-authenticated: 1` が付き、`x-pp-initial-items` は無い | 「通信しない」はモック境界の外。前提の 1 点目を参照 |
| Frontend Unit（`middleware.test.ts`） | クライアントが偽装した `x-pp-authenticated` は、判定前に必ず削除される（`/stock-items` でセッションなし・判定不能のとき伝わらない） | 既存 S-10 の `/stock-items` 版 |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。middleware の分岐は request / response を組み立てるだけで、ブラウザは不要。「通信しないこと」は E2E でも観測できないため、本番ログ（tasks 8.1）で確認する。ページが表示されること自体は S-10 の E2E が通しで担保する

---

### S-2: 期限切れのセッションで `/stock-items` を開くと、middleware が更新して新しい cookie を返す
**Given:** アクセストークンは期限切れで、refresh token は有効
**When:**  `/stock-items` にアクセスする
**Then:**  middleware が `getSession()` 内でセッションを更新する。新しい cookie が Set-Cookie で返り、リクエストは通る

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`middleware.test.ts`） | `getSession` モックの中で `setAll()` を呼ばせたとき、更新後の cookie が response の Set-Cookie に載る。Cache-Control などの header も反映される。`x-pp-authenticated` を付けるために response を作り直しても、cookie と header が消えない | 既存 S-7 の `/stock-items` 版。`rebuildResponseFromRequest` の回帰を防ぐ |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。E2E で期限切れの状態を作るには、トークンの期限切れを待つか偽造する必要がある。どちらも高コストで、得られる情報は Unit と同じ

---

### S-3: `/stock-items` で `getSession()` が失敗したとき、一時障害なら通し、確定的なエラー・セッションなしなら cookie を消して `/login` へ送る
**Given:** `/stock-items` へのリクエストで、`getSession()` が次のいずれかになる
- (a) `AuthRetryableFetchError` で resolve する
- (b) `AuthRefreshDiscardedError` で resolve する
- (c) 例外を投げる
- (d) それ以外のエラー（refresh token が無効など）で resolve する
- (e) `session === null` で、エラーもない

**When:**  `/stock-items` にアクセスする
**Then:**  (a)(b)(c) は fail open。`/login` へは送らず、`x-pp-authenticated` も付けない。(d)(e) は `sb-*-auth-token` 系の cookie（チャンク分割を含む）を失効させて `/login` へリダイレクトする

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`middleware.test.ts`） | (a)〜(e) の分岐をそれぞれ 1 ケースずつ確認する。(a)(b)(c) では `console.error` が出て、redirect しない。(d)(e) では redirect 先が `/login` で、単一の cookie とチャンク分割された cookie（`.0`, `.1`）の両方に `maxAge: 0` が設定される | 既存 S-3・S-8・S-9 の `/stock-items` 版。fail open の対象を広げすぎていないか（(d) を通してしまわないか）が discriminator |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。Supabase の一時障害は E2E では再現できない。セッションなしで `/login` に送られることは、既存の `auth.spec.ts` S-4（JS 無効でも `/login` へリダイレクト）が `/stock-items` で回帰を見ている。このため新しい E2E は追加しない

---

### S-4: 件数の多いグループでも、page は Go API を 1 回だけ呼んで全在庫を返す
**Given:** 有効なセッション cookie と activeGroupId cookie がある。Go API は 82 件以上の在庫を返す
**When:**  `/stock-items` の SSR で `getInitialStockItems()` が呼ばれる
**Then:**  `fetchStockItems()` が 1 回だけ呼ばれ、返った全件がそのまま返る

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`getInitialStockItems.test.ts`） | 100 件程度の配列を返すモックで、`fetchStockItems` の呼び出しが 1 回、戻り値が全件と一致する。引数はアクセストークンと activeGroupId | 件数で分岐する処理（6KiB の閾値）が無くなったことの確認 |
| Frontend Unit（`getInitialStockItems.test.ts`） | request に `x-pp-initial-items` が付いていても（クライアントの偽装）、page はそれを読まずに `fetchStockItems` を 1 回呼ぶ | ヘッダー読み取りを消し忘れていないかの discriminator |
| Frontend Unit（`middleware.test.ts`） | `/stock-items` へのリクエストで、cookie がすべて揃っていても middleware は `fetchStockItems` を呼ばない | 既存の「Phase 2」系テストを削除・置き換える |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。回数の検証はモックの呼び出し回数で決まる。Playwright からサーバー間の fetch は見えない。本番での回数は tasks 8.1 で確認する。全件が描画されることは S-10 の E2E と、本番計測（tasks 1.x / 7.2）で見る

---

### S-5: 期限内だが署名が不正なトークンで開くと、在庫は HTML に載らず、cookie が消されて `/login` に着地する（ループしない）
**Given:** `exp` は期限内だが署名部だけを書き換えたアクセストークンを含むセッション cookie と、有効な activeGroupId cookie を持っている
**When:**  `/stock-items` にアクセスする
**Then:**  middleware は期限内として通すが、Go API が 401 を返す。page は HTML を返す前に、cookie を消す Route Handler へリダイレクトする。Route Handler が cookie を失効させて `/login` へ送る。ブラウザは `/login` に留まり、`/stock-items` へ押し戻されない。応答のどこにも在庫データは含まれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock（`ssr-stock-items.spec.ts` に追加、または新しい spec） | (1) `request` を `maxRedirects: 0` で送り、`/stock-items` の応答が 3xx で cookie を消す Route Handler に向いていること、本文に seed した商品名が無いことを確認する。(2) JS 有効のブラウザで `page.goto("/stock-items")` し、最終的な URL が `/login` で一定時間留まること、`context.cookies()` に `sb-*-auth-token` が残っていないことを確認する | 改ざんしたトークンは、E2E のテストユーザーでログインして得た実際のトークンから、署名部だけを書き換えて作る。`exp` と `expires_at` は期限内のまま残す。**activeGroupId cookie を必ずセットする**（無いと page が API を呼ばずに `null` を返し、検証が空振りする）。`storageState` は `browser.newContext()` に明示的に渡して組み立てる（decision-log 2026-09-10） |
| Frontend Unit（`getInitialStockItems.test.ts`） | `fetchStockItems` が `status: 401` のエラーを投げ、cookie のトークンの `exp` が未来のとき、Route Handler のパスへ `redirect()` する。`redirect` モックは throw するようにし、`getInitialStockItems()` が reject すること（`null` を resolve しないこと）を確認する | 前提の 2 点目を参照。`exp` が現在時刻ちょうどの境界は、期限切れ側として扱う |

**E2E判定:** Yes（E2E Mock）
**理由:** 判定ツリー Q1 = Yes。アンチゴールの「不正なトークンで在庫が HTML に載る」と「`/login` ループ」は、middleware → page → 実際の Go API の署名検証 → Route Handler → ブラウザの cookie ストア → `/login` のクライアントのセッション判定、という連鎖の結果として起きる。各部品の Unit をすべて満たしても、つなぎ目（Set-Cookie がブラウザに届くか、`/login` のクライアントが残った cookie を見て押し戻さないか）は Unit では観測できない。Q2 = No（Google CSE・Realtime を使わず、ローカルの Go API が実際に署名を検証する）なので Mock

---

### S-6: 期限切れのトークンで Go API が 401 を返したとき、ログアウトさせずにクライアント側の取得に任せる
**Given:** middleware での更新が一時障害で失敗し、fail open で通った。cookie のアクセストークンは期限切れのまま
**When:**  `/stock-items` の SSR で、Go API が 401 を返す
**Then:**  `getInitialStockItems()` は `null` を返す。`redirect()` は呼ばず、cookie も消さない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`getInitialStockItems.test.ts`） | `status: 401` のエラーで、トークンの `exp` が過去のとき、`null` を返し、`redirect` モックが呼ばれない | S-5 の Unit と対になる discriminator。`exp` の判定を逆にした実装では、どちらかが red になる |
| Frontend Unit（`getInitialStockItems.test.ts`） | `exp` を読み取れない（payload が壊れている、`exp` が無い）トークンで 401 を受けたとき、確定的に無効として Route Handler のパスへ `redirect()` する（S-5 と同じ扱い） | レビューで決定（2026-10-18）: 一時障害で起きる状態ではないため、ログアウト側に倒す |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。前提となる「middleware の更新が一時障害で失敗する」状況は、E2E では再現できない。`null` を受けたあとクライアントが取得し直す流れは、既存の `useStockItems` のテストで担保されている

---

### S-7: 403・5xx・タイムアウトのとき、`null` を返してクライアント側の取得に任せる（他人のグループの在庫は載らない）
**Given:** 期限内のトークンを持っている
**When:**  SSR で Go API が 403（グループに所属していない）、500 / 503 を返す、またはタイムアウトする
**Then:**  `getInitialStockItems()` は `null` を返す。`redirect()` は呼ばない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`getInitialStockItems.test.ts`） | 403・500・タイムアウト（`AbortError` など、ステータスを持たないエラー）の 3 ケースで、`null` を返し、`redirect` モックが呼ばれない。`console.error` でエラーが記録される | 「401 以外は従来どおり」の回帰。`status` を持たないエラーで `instanceof` 判定が例外にならないことも見る |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。Go API のエラー応答はモックで固定でき、「API レスポンス形式が固定」の代替条件にあたる。他人のグループの在庫が載らないことは、Go API が 403 を返すこと（B-2）と、page が 403 で `null` を返すこと（この Unit）の組み合わせで担保する

---

### S-8: cookie を消して `/login` へ送る Route Handler
**Given:** `sb-<ref>-auth-token`（単一、またはチャンク分割された `.0` / `.1`）とその他の cookie を持っている
**When:**  cookie を消す Route Handler にアクセスする（クエリで行き先を指定しようとする場合も含む）
**Then:**  `sb-*-auth-token` 系の cookie だけが失効し、`/login` へリダイレクトされる。リダイレクト先は常に `/login` で、クエリによる行き先の指定は無視する。middleware はこのパスでセッション判定をしない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（Route Handler のテスト） | 単一の cookie とチャンク分割された cookie の両方に `maxAge: 0`（`path: "/"`）の Set-Cookie が出る。auth-token 以外の cookie（activeGroupId など）は消さない。ステータスが 307 / 303 で、`Location` が `/login` | 失効のさせ方は middleware の既存実装（S-9 (a)(b)）と同じ結果になること |
| Frontend Unit（Route Handler のテスト） | `?next=https://evil.example` などを付けても、`Location` は `/login` のまま | オープンリダイレクト対策 |
| Frontend Unit（`middleware.test.ts`） | このパスへのリクエストで `getSession` / `getClaims` が呼ばれず、そのまま通る | `EXCLUDED_PATHS` への追加の確認。入れ忘れると、無効な cookie で middleware が `/login` へ送り直したり、別の判定を挟んだりする |

**E2E判定:** No（単体では）
**理由:** 判定ツリー Q1 = No。Route Handler の入出力は Request / Response で完結する。ブラウザに Set-Cookie が届いてループしないことは、S-5 の E2E が通しで確認する

---

### S-9: `/stock-items` 以外の保護ルート（`/`・`/invite`・`/no-group`）は従来どおり `getClaims()` で判定する
**Given:** `/`・`/invite`・`/no-group` へのリクエスト
**When:**  `getClaims()` が、認証済み、未ログイン、retryable エラー、確定的なエラー、例外のいずれかを返す
**Then:**  これまでと同じ分岐（通過、fail open、cookie を消して `/login`）になる。`getSession()` は呼ばれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`middleware.test.ts`） | 既存の `getClaims` 系テスト（S-3・S-7・S-8・S-9・S-10・Server-Timing）を `/invite` などに送るよう付け替え、すべて green のまま。加えて、`/invite` で `getSession` モックが呼ばれないことを 1 ケース確認する | 既存テストの多くは `/stock-items` に送っているため、そのまま流用すると `getClaims` の挙動を担保しなくなる（前提の 3 点目）。付け替えの対象と、`/stock-items` 用に書き換える対象を仕分ける |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。変更しない経路の回帰であり、既存の Unit を付け替えれば足りる。既存の `auth.spec.ts` S-5（`/no-group` へのリダイレクト）も、そのまま回帰として通る

---

### S-10: JS を無効にしても、初期 HTML に在庫が描画される（既存の回帰テスト）
**Given:** 認証済みの storageState と activeGroupId cookie を持ち、在庫を 1 件 seed してある
**When:**  JS を無効にしたブラウザで `/stock-items` を開く
**Then:**  初期 HTML の `article[aria-label=<商品名>]` が表示される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock（既存 `ssr-stock-items.spec.ts`） | 変更せずにそのまま通る。middleware（`getSession` で通過）→ page（Go API を 1 回）→ HTML の連鎖が、ヘッダー経由の受け渡しなしでつながっていることを確認する | 新しい spec は作らない。既存のテストは seed が少なく 6KiB 未満のため、変更前はヘッダー経由で通っていた。変更後はヘッダーが無くなるため、page 自身の取得経路で通ることになる。変更前後のどちらでも green になる回帰テストであり、新旧の経路を見分ける discriminator ではない（経路の違いは S-4 の Unit で見る） |

**E2E判定:** Yes（E2E Mock、既存）
**理由:** 判定ツリー Q1 = Yes。JS 無効時の初期 HTML は、ブラウザで JS を止めて見ないと確認できない（アンチゴール「JS 無効時の初期 HTML 要件の破壊」）。Q2 = No なので Mock。`page.tsx` に Suspense を置かないことも、このテストが間接的に守る

---

### S-11: 区間ごとの所要時間と分岐の結果がログ・Server-Timing で区別できる。エラー型はステータスを持ち、メッセージは変わらない
**Given:** `/stock-items` へのリクエストが処理される
**When:**  middleware がセッションを判定し、page が在庫を取得する（成功、401 で redirect、401 で `null`、その他で `null`）
**Then:**  middleware の Server-Timing には `claims` 区間（セッション判定の時間）があり、`items` 区間は無い。page のログには `readAccessTokenFromCookies;dur=` と `fetchStockItems;dur=` が出る。401 で `/login` へ送った場合、401 で `null` を返した場合、その他の失敗で `null` を返した場合が、ログで区別できる。`fetchStockItems` が投げるエラーは `status` を持ち、メッセージは `HTTP <status>` のまま

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit（`middleware.test.ts`） | `/stock-items` で、通過・redirect・fail open（例外）のそれぞれで Server-Timing に `claims;dur=` があり、`items` が無い | 区間名を `claims` のまま残すかは実装に任せる（D6）。名前を変えるならテストもそれに合わせる |
| Frontend Unit（`getInitialStockItems.test.ts`） | 3 つの失敗の分岐で、それぞれ異なるログ文言が出る | S-5・S-6・S-7 のテストに観点として相乗りしてよい |
| Frontend Unit（`api.test.ts`） | 401 の応答で、`instanceof <新しいエラー型>` と `instanceof Error` がどちらも true、`status === 401`、`message === "HTTP 401"`。500 でも `status === 500` | 既存の「エラーレスポンスで throw される」の拡張。ほかの呼び出し元（`useStockItems` など）の挙動が変わらないことは、既存のテストが green のままであることで確認する |

**E2E判定:** No
**理由:** 判定ツリー Q1 = No。ログとヘッダーの出力はモックで直接確認できる。本番での区間の値は計測（tasks 1.x / 8.x）で見る

---

## バックエンドシナリオ

Go API の挙動は変更しない（Non-Goal）。以下は、このフロントエンドの変更が**依存する Go API の契約**と、それを担保するテスト。B-1 には、今回の構成で在庫を守る砦となるケースのテストを 1 件追加する（テストのみの追加。レビューで決定、2026-10-18）。

### サマリ
| # | シナリオ | スコープ |
|---|---------|---------|
| B-1 | 署名が不正なトークン・期限切れのトークンは 401 になる | Backend Unit（既存 + 1 件追加） |
| B-2 | 所属していないグループの在庫を要求すると 403 になる | Backend Unit（既存） |

### B-1: 署名が不正なトークン・期限切れのトークンは 401 になる
**Given:** `JWTAuth` ミドルウェアが有効
**When:**  `GET /api/stock-items` に、形式が不正なトークン、期限切れのトークン、または**形式は正しく期限内だが別の鍵で署名されたトークン**を `Authorization: Bearer` で送る
**Then:**  401 が返り、在庫データは返らない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit（既存 `backend/middleware/auth_test.go` の `invalid_token` / `expired_token`） | 401 になる | 既存の `invalid_token` は `"not-a-jwt"`（形式が不正）だけを見ている |
| Backend Unit（`auth_test.go` に追加） | 形式は正しく期限内だが、検証用の鍵とは別の鍵で署名された JWT で 401 になり、在庫ハンドラが呼ばれない | フロントエンドの S-5 が依存するケース。S-5 の E2E でも間接的に担保される |

### B-2: 所属していないグループの在庫を要求すると 403 になる
**Given:** 期限内で正しく署名されたトークンを持つが、`X-Active-Group-ID` のグループには所属していない
**When:**  `GET /api/stock-items` を呼ぶ
**Then:**  403 が返り、在庫データは返らない（フロントエンドの S-7 で `null` になる）

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit（既存 `auth_test.go` の `require_group_not_member` / `require_group_invalid_group_id`） | 403 になる | 変更なし。アンチゴール「他人のグループの在庫が初期 HTML に載る」の根拠 |
