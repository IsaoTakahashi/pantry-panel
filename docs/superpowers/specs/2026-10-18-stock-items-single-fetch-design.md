# /stock-items の在庫取得を 1 回にする（middleware 先読みの廃止）設計

- 日付: 2026-10-18
- Issue: #306
- 関連: #304（アクセストークン有効期限の延長）、#307（middleware がシンガポールから外部通信している疑い、範囲外）、PR #301 / openspec spec `stock-items-ssr-prefetch`

## 意図と背景

`/stock-items` では、middleware が認証の検証（`getClaims()`）と在庫の先読み（`fetchStockItems()`）を並列に走らせている（PR #301）。結果は `x-pp-initial-items` ヘッダーで page に渡している。ところが、データの多いグループではこの仕組みが一度も効いていない。

- ヘッダーの上限は base64 後 6KiB。最大のグループは 82 件で、DB 上の JSON が約 31KB（base64 後は約 42KB）あり、常に上限を超える
- 上限を超えるとエラーを出さずにフォールバックし、page が Go API をもう一度呼ぶ。1 回のアクセスで Lambda を 2 回呼び、page の取得が直列で追加される
- 2026-10-18 12:52Z の実機ログで確認済み（middleware はエラーなし、page で `fetchStockItems;dur=67.0`）

加えて middleware の `getClaims()` は、署名の検証に JWKS を使う。middleware が新しく立ち上がるたび（6〜12 分おき）に JWKS を取り直しており、その上流時間は中央値約 360ms で、表示までの経路に乗っている。

middleware と page はメモリを共有できない。データを渡す手段はヘッダーか cookie しかなく、大きなデータを同じリクエストの中で渡す方法は実質ない。そこで、受け渡し自体をやめて役割分担を変える。

## ユーザーが決めたこと

- 目的は二つ。**無駄な処理を減らすこと**と、**`/stock-items` にアクセスしてから在庫がすべて表示されるまでの時間を短くすること**
- **`/stock-items` では、middleware でトークンの署名を検証しない。** 署名とグループ所属の検証は Go API に任せる（Go API はもともとリクエストごとに JWT を検証し、DB でグループ所属を確認している: `backend/middleware/auth.go`）。ユーザー談:「署名の検証も最終的に Go API で担保されれば OK」
- 効果は「`/stock-items` にアクセスしてから在庫がすべて表示されるまでの時間」で判断する

## 目標

1. `/stock-items` への 1 回のアクセスで、Go API の在庫取得が 1 回だけになる（件数によらない）
2. middleware が JWKS を取得する処理を、`/stock-items` の表示までの経路から外す
3. 初期 HTML に実データを埋め込む要件（spec `stock-items-ssr-prefetch`「SSR は初期 HTML に実データを埋め込む」、`e2e/ssr-stock-items.spec.ts` の JS 無効テスト）を維持する

## 非目標

- middleware の実行場所の修正（#307 で別途扱う）
- `/`・`/invite`・`/no-group` など、ほかの保護ルートの検証方式の変更（今の `getClaims()` のまま。**Claude の判断**: PWA の起動 URL は `/stock-items`（`frontend/src/app/manifest.ts`）であり、効果が出るのはここ。範囲を小さく保つ）
- Go API 側の変更

## やってはいけないこと（アンチゴール）

- 不正なトークンや他人のグループの在庫が、初期 HTML に載ること
- 無効な cookie が残り、`/login` と `/stock-items` の間でリダイレクトがループすること
- 一時的な障害（Supabase の通信エラー等）で、ログイン済みのユーザーが `/login` に飛ばされること（既存の fail-open の方針を崩さない）
- `page.tsx` に Suspense の境界を置くこと（既存コメントのとおり、JS 無効時の初期 HTML 要件が壊れる）

## 変更後の動き

### middleware（`/stock-items` のみ）

- `getClaims()` の代わりに `getSession()` を使う。cookie を読み、アクセストークンが有効期限内ならネットワーク通信なしで通過する。期限切れなら refresh token で更新し、新しい cookie を返す（ここだけ Supabase Auth と通信する）
- セッションが無ければ、これまでどおり `/login` へリダイレクトする
- `getSession()` が一時的なエラー（retryable / refresh discarded）になった場合は、既存と同じく fail open（通過）する。確定的なエラー（refresh token が無効など）は未ログイン扱いにして、既存と同じく cookie を消して `/login` へ送る
- 在庫の先読み（`fetchStockItems()` の並列発射）と `x-pp-initial-items` ヘッダーは**廃止**する。クライアントが偽装した `x-pp-initial-items` を消す処理も不要になる
- `x-pp-authenticated` は「有効期限内のセッションがある」ことを根拠に付ける（署名は未検証）。これは layout が AuthProvider の初期状態を決めるための UX 上のヒントであり、データの保護には使わない。偽装ヘッダーを消す既存処理は残す

### page（`getInitialStockItems`）

- cookie のアクセストークンと activeGroupId で Go API を 1 回呼ぶ（今のフォールバック経路と同じ処理が常に走る形）
- **Go API が 401 を返した場合**は、cookie のアクセストークンの期限（`exp`）を手元で確認して分岐する（**Claude の判断**）。`exp` は署名を検証せずに payload を読むだけで分かる
  - **期限内のトークンで 401**: トークンが確定的に無効と判断する。HTML を返す前に cookie を消して `/login` へ送る。Server Component は cookie を書けないため、cookie を消してから `/login` へリダイレクトする Route Handler を用意し、そこへ `redirect()` する（**Claude の判断**: 既存 middleware の「確定的に無効なら cookie を消して redirect」と同じ結果になり、ループを防ぐ）
  - **期限切れのトークンで 401**: middleware での更新が一時エラーで失敗し、fail open で通ってきたケース。`/login` には送らず `null` を返し、クライアント側の取得に任せる（アンチゴール「一時的な障害でログイン済みのユーザーを `/login` に飛ばさない」を守るため）。middleware から page への新しい内部ヘッダーは不要
- 401 とそれ以外を区別するため、`frontend/src/lib/api.ts` にステータスコードを持つエラー型を追加し、`fetchStockItems` はそれを投げる（**Claude の判断**）。`Error` のサブクラスにしてメッセージ（`HTTP 401` 等）も今と同じにし、クライアントなどほかの呼び出し元の挙動は変えない
- 401 以外の失敗（403・5xx・タイムアウト等）は今と同じく `null` を返し、クライアント側の `useStockItems` の取得に任せる

### セキュリティ上の整理

- 署名が不正なトークンを持つリクエストが来ても、在庫データは Go API の 401 で拒否され、HTML には載らない
- `x-pp-authenticated=1` が付いても、見えるのは画面の枠だけ。データは Go API を通らないと取れない
- spec `ssr-session-auth` の「middleware は認可の境界ではない」という前提と一致する。ただし同 spec の「確定的に無効なトークンは未ログイン扱い」は `/stock-items` では Go API の 401 で実現する形に変わるため、spec の該当 Requirement を更新する必要がある

## 制約

- Next.js 16.3.8。middleware は現状 `frontend/src/middleware.ts`
- `@supabase/ssr` の `getSession()` は cookie の内容を検証せずに返す（Supabase のドキュメント上「サーバーでは信頼するな」とされる）。今回はそれを承知のうえで、信頼の根拠を Go API に置く
- アクセストークンの有効期限は 24 時間（#304）。多くのアクセスで middleware の Supabase 通信はゼロになる
- 既存の Server-Timing（middleware）と構造化ログ（`getInitialStockItems: ...;dur=`）は、効果測定に使うため残す。middleware の `items` 区間は先読みの廃止とともに無くなる

## 効果の測り方

ユーザーの判断基準:「`/stock-items` にアクセスしてから在庫がすべて表示されるまでの時間」。

- 本番に対して、Playwright でログイン済みの状態（storageState）を再現し、`/stock-items` へ移動してから、最大のグループ（82 件）の在庫が全件表示されるまでの時間を測る。同じ方法で変更前と変更後の両方を測る
- middleware が冷えた状態（15 分以上あけた直後）と温まった状態の両方で、それぞれ複数回測る
- 補助として Vercel のランタイムログで、1 回のアクセスあたりの Go API 呼び出しが 1 回であること、middleware からの JWKS 取得が無いことを確認する
- 計測にはユーザー本人のアカウントのログイン状態を使ってよい（ユーザー了承済み）。storageState には認証トークンが含まれるため、コミットしない（`measurement/` は gitignore 済み）
- Vercel Preview はデプロイ保護があるため、変更後の本番計測はマージ後に行う。変更前の計測は実装前に取っておく

### 合否と巻き戻し

- 「無駄な処理の削減」（Go API の呼び出しが 1 回になる）は、ログで確認できれば達成とする
- 表示までの時間は、**極端に伸びていなければ巻き戻さない**（ユーザーの判断）。「極端」の目安は、同じ条件（冷えた状態／温まった状態）の中央値が変更前より 20% 以上悪化した場合とする（**Claude の判断**: 本番計測のばらつきを超える悪化だけを拾うため）。その場合は原因を調べ、巻き戻すかどうかをユーザーに相談する

## 実装する人に任せること

- `getSession()` のエラー分類の細部（既存の `getClaims()` 用の判定ロジックをどこまで流用するか）
- cookie を消すための Route Handler のパスと名前
- テストの組み立て（既存の `middleware.test.ts`・`getInitialStockItems` のテスト・`e2e/ssr-stock-items.spec.ts` の改修）
- 変更前の計測を、実装に入る前に取っておく段取り
- openspec の spec（`stock-items-ssr-prefetch`、`ssr-session-auth`）の Requirement の書き換え方
