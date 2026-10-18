## Why

`/stock-items` の middleware が在庫を先読みして `x-pp-initial-items` ヘッダーで page に渡す仕組み（PR #301）は、データの多いグループでは一度も効いていない。最大のグループは 82 件・base64 後で約 42KB あり、ヘッダーの上限 6KiB を常に超える。そのたびにエラーを出さずに page 側の取り直しに切り替わり、1 回のアクセスで Go API（Lambda）を 2 回呼んでいる（2026-10-18 本番ログで確認、Issue #306）。

加えて、middleware の `getClaims()` は署名の検証用に JWKS を取得する。middleware が新しく立ち上がるたび（6〜12 分おき）に約 360ms の取得が発生し、表示までの経路に乗っている。ユーザーの目的は「無駄な処理を減らすこと」と「`/stock-items` にアクセスしてから在庫がすべて表示されるまでの時間を短くすること」。

設計の詳細は `docs/superpowers/specs/2026-10-18-stock-items-single-fetch-design.md`（ユーザー承認済み）。

## What Changes

- `/stock-items` の middleware は、署名を検証する `getClaims()` の代わりに `getSession()` を使う。トークンが期限内ならネットワーク通信なしで通過し、期限切れのときだけ更新する。**`/stock-items` では middleware が署名を検証しなくなる**（署名とグループ所属の検証は Go API が担う。ユーザー了承済み）
- **BREAKING（内部契約）**: middleware の在庫先読みと `x-pp-initial-items` ヘッダーを廃止する
- page（`getInitialStockItems`）は、cookie のトークンで Go API を 1 回だけ呼ぶ
- Go API が 401 を返した場合は、トークンの期限（`exp`）で分岐する
  - 期限内: cookie を消す Route Handler を経由して `/login` へリダイレクトする
  - 期限切れ: `null` を返し、クライアント側の取得に任せる
- `frontend/src/lib/api.ts` に、ステータスコードを持つエラー型を追加する（メッセージは今と同じ。ほかの呼び出し元の挙動は変えない）
- `x-pp-authenticated` は、`/stock-items` では「期限内のセッションがある」ことを根拠に付ける
- `/`・`/invite`・`/no-group` など、ほかの保護ルートは今の `getClaims()` のまま

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `stock-items-ssr-prefetch`: 「認証検証と在庫データ取得を並行実行する」「未認証時は並行取得したデータを破棄する」「事前取得データが使えない場合はフォールバック取得する」を廃止する。代わりに「1 回のアクセスで在庫取得は 1 回」「Go API の 401 の扱い」を追加する。「区間ごとの所要時間を観測可能にする」を新しい構成に合わせて更新する
- `ssr-session-auth`: `/stock-items` では、middleware が署名の検証をせずにセッションの有無・期限だけを判定する。確定的に無効なトークンは Go API の 401 で判定し、cookie を消して `/login` へ送る。`x-pp-authenticated` を付ける根拠も変わる

## Impact

- コード: `frontend/src/middleware.ts`、`frontend/src/app/stock-items/getInitialStockItems.ts`、`frontend/src/lib/api.ts`、新しい Route Handler（cookie を消して `/login` へ送る）、関連するテスト（`middleware.test.ts`、`getInitialStockItems` のテスト、`e2e/ssr-stock-items.spec.ts` など）
- Go API・DB・Supabase の設定: 変更なし
- 運用: Lambda の在庫取得が 1 アクセスあたり 2 回から 1 回に減る。middleware の JWKS 取得が `/stock-items` の表示までの経路から外れる
- 計測: 変更前と変更後で、本番の「在庫がすべて表示されるまでの時間」を Playwright で測る（ユーザー本人のアカウントのログイン状態を使う。ユーザー了承済み）

## ユーザーシナリオとテスト設計

（テスト設計フェーズで test-design agent が作成する）
