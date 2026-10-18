## Context

動機は proposal.md の「Why」を参照。詳しい設計の経緯（ユーザーと合意した判断、アンチゴール、計測方法）は `docs/superpowers/specs/2026-10-18-stock-items-single-fetch-design.md` にある。

現状の `/stock-items`:
- `frontend/src/middleware.ts` が `getClaims()`（署名検証。JWKS を取得する）と `fetchStockItems()`（先読み）を `Promise.all` で並列に発射する。先読みの結果は base64url で `x-pp-initial-items` ヘッダーに載せるが、6KiB を超えると載せない
- `frontend/src/app/stock-items/getInitialStockItems.ts` はヘッダーを読み、無ければ cookie からトークンを読んで `fetchStockItems()` を呼び直す
- Go API（`backend/middleware/auth.go`）はリクエストごとに JWT を検証し、DB でグループ所属を確認する
- アクセストークンの有効期限は 24 時間（#304）

## Goals / Non-Goals

**Goals:**
- `/stock-items` の middleware から、JWKS の取得と Go API の呼び出しをなくす
- 1 アクセスで Go API の在庫取得を 1 回にする

**Non-Goals:**
- middleware の実行リージョン・ランタイムの変更（#307）
- `/stock-items` 以外の保護ルートの検証方式の変更
- Go API の挙動の変更（ただし、別の鍵で署名された期限内トークンが 401 になることのテストは追加する）

## Decisions

### D1: `/stock-items` の middleware は `getSession()` を使う
- `getSession()` は cookie を読み、期限内ならそのまま返す（通信なし）。期限切れなら refresh token で更新し、`setAll` 経由で cookie を書き戻す。既存の `setAll` 実装（pendingCookies・cacheHeaders の累積）はそのまま使える
- 代替案: `getClaims()` を残す → JWKS 取得（約 360ms）が経路に残る。ローカルで `exp` だけ見る自前実装 → 更新処理を自分で書くことになり、`@supabase/ssr` の cookie 管理と二重になる
- エラーの分類は既存の `getClaims()` 用と同じ方針で扱う。retryable / refresh discarded は fail open、それ以外のエラーは未ログイン確定として cookie を消して `/login` へ送る。セッションが無い場合（`session === null` かつエラーなし）は `/login` へ送る

### D2: 在庫の先読みと `x-pp-initial-items` を廃止する
- middleware と page はメモリを共有できない。ヘッダー以外に大きなデータを渡す手段がない
- 代替案: ヘッダーの上限を上げる・圧縮する → 件数が増えれば再び上限に当たり、Vercel のヘッダー全体の制限にも近づく（ユーザーが不採用とした）

### D3: SSR の 401 は `exp` で分岐する
- 期限内のトークンで 401 → 確定的に無効。cookie を消して `/login` へリダイレクトする Route Handler に `redirect()` する。在庫データを含む HTML は返さない。dev では 307 になるが、本番ビルドでは PPR の静的シェルを先に流すためステータスが 200 で確定済みで、Next.js は RSC ペイロードに redirect の digest（`NEXT_REDIRECT;replace;/auth/clear-session;307;`）を埋め込み、クライアントのルーターが遷移する。3xx にするには middleware での fetch を戻す必要があるため、この挙動を受け入れる
- 期限切れのトークンで 401 → middleware の更新が一時障害で失敗した fail open のケース。`null` を返してクライアントの `useStockItems` に任せる
- `exp` は cookie のトークンの payload を base64url デコードして読む（署名検証はしない。判断材料は「期限内かどうか」だけで、信頼の根拠ではない）。page はこの `exp` だけで判定し、セッションの `expires_at` は使わない。`exp <= 現在時刻` を期限切れとする（境界はログアウトさせない側に倒す）
- `exp` を読み取れないトークン（payload が壊れている、`exp` が無い）で 401 → 確定的に無効として、期限内と同じく cookie を消して `/login` へ送る（一時障害で起きる状態ではないため）
- 代替案: middleware の判定結果を内部ヘッダーで page に渡す → 偽装対策を含め受け渡しの契約が増える。`exp` は page 側だけで判定できるため不要

### D4: cookie を消す Route Handler
- Server Component は cookie を書けないため、cookie の失効と `/login` へのリダイレクトを行う Route Handler を新設する。`sb-*-auth-token` 系（チャンク分割を含む）を失効させる処理は middleware の既存実装と同じ結果にする
- このルートは middleware の `EXCLUDED_PATHS` に含め、セッション判定を通さない
- オープンリダイレクトを避けるため、リダイレクト先は `/login` 固定とし、クエリで行き先を受け取らない

### D5: ステータス付きエラー型
- `frontend/src/lib/api.ts` に、`status` を持つ `Error` のサブクラスを追加し、`fetchStockItems` の `!response.ok` で投げる。メッセージは `HTTP <status>` のまま
- `instanceof` で 401 を判定できる。既存の呼び出し元（クライアントの `useStockItems` 等）は `Error` として扱っているため挙動は変わらない

### D6: 観測性
- middleware の Server-Timing は、セッション判定の区間（今の `claims`）を残す。先読みの `items` 区間はなくなる
- `getInitialStockItems` の構造化ログ（`readAccessTokenFromCookies;dur=`、`fetchStockItems;dur=`）は残す。401 で `/login` へ送った場合・`null` を返した場合も区別できるログを出す

## Risks / Trade-offs

- [`getSession()` は cookie を検証しない] → `/stock-items` で middleware を通過しても、データは Go API の検証を通らないと取れない。`x-pp-authenticated` は画面の初期状態のヒントにのみ使う（spec `ssr-session-auth` に明記）
- [Go API の JWKS 取得失敗（未知の鍵 ID 等）でも 401 になる] → 期限内トークンなら `/login` へ送られる。鍵ローテーション時の一時的な事象で、再ログインで回復する。発生頻度は低いため許容する
- [署名が不正な cookie を持つリクエストで、画面の枠の描画に `x-pp-authenticated=1` が使われる] → 本番のストリーミング応答では、PPR の静的シェル（在庫データを含まない枠）が 200 で先に返りうる。ただし在庫データは載らず、同じ応答内の redirect digest によりクライアントが直ちに `/auth/clear-session` → `/login` へ遷移するため、枠は一瞬表示されうるだけで、在庫の漏えいや操作可能な状態にはならない
- [ウォームアップ（`/api/warm/stock-items`）の効果が変わる] → ウォームアップは `/stock-items` を内部で叩くだけなので、新しい経路をそのまま温める

## Migration Plan

- フロントエンドだけの変更で、Vercel へのデプロイで反映される
- 実装前に変更前の本番計測を取る。マージ後に同じ方法で変更後を計測する
- 巻き戻しは revert PR で行う。基準は「同じ条件での中央値が変更前より 20% 以上悪化」。その場合は巻き戻す前にユーザーに相談する
