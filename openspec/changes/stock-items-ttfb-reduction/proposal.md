## Why

本番iPhone PWAで `/stock-items` 初回表示時、白い画面が約3.4秒続くことを動画のフレーム解析で確認した。`page.tsx` は設計上（design.md D2/D3）SSRの初期HTMLに実データを埋め込むため境界なしでデータ取得をawaitしており、白画面時間はほぼそのままTTFBになる。TTFBの内訳をcurlで概算計測したところ、`middleware.ts` の認証検証(`getClaims()`)、SSRの`getSession()`（middlewareと重複したSupabase呼び出し）、Go Lambdaへのフェッチ(`fetchStockItems()`)の3区間が直列に発生しており、cold時の合算が実測値とほぼ一致する。既存のwarmup対策（cron-job.org, Lambda `/health`直叩き）は実測で実アクセスに間に合っていないケースがあり、warmup頻度の見直しだけでは解決しない。直列区間そのものの削減・並列化が必要。

## What Changes

- SSRの`getInitialStockItems()`から重複したSupabase `getSession()`呼び出しを廃止し、middlewareが検証・リフレッシュ済みのトークンをcookieから直接読む
- `middleware.ts`内で認証検証(`getClaims()`)とGo Lambdaへのstock itemsフェッチを`Promise.all`で並列発射する。未認証確定時は並行取得できていたフェッチ結果を破棄し、現行通り`/login`へリダイレクトする
- 並列取得したstock itemsをheader経由でpageに引き継ぐ新しい伝達経路を追加する。ペイロードがサイズ閾値を超える場合・フェッチ失敗時はpage側の従来フェッチにフォールバックする
- `middleware.ts`と`getInitialStockItems.ts`にServer-Timingによる区間計測を追加する（実装の最初のフェーズとして先行投入し、cold差分の内訳を確認してから並列発射の実装を確定する判断ゲートとする）

## Capabilities

### New Capabilities
- `stock-items-ssr-prefetch`: `/stock-items`ページのSSRが初期HTMLに実データを埋め込む挙動（既存実装だが未文書化だったIssue #182の成果）を正式化し、今回追加する「middlewareでの並列フェッチ・header経由の伝達・サイズ超過時のフォールバック・区間計測」の挙動を定義する

### Modified Capabilities
（なし。`ssr-session-auth`のcookie保存・fail open判定・リダイレクト・`x-pp-authenticated`ヘッダーの意味に関する既存requirementのテキストは変更しない。middleware.ts内部に並列フェッチ処理を追加するのみで、認証まわりのrequirement自体は変わらない）

## Impact

- 変更対象: `frontend/src/middleware.ts`, `frontend/src/app/stock-items/getInitialStockItems.ts`
- 変更なし: Go backend（JWT検証ロジックは今回のスコープ外）、cron-job.orgのwarmup設定（別issueとする）
- 依存関係: `ssr-session-auth`（`x-pp-authenticated`ヘッダーの契約を前提として利用するが、その契約自体は変更しない）
