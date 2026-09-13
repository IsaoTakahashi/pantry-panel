# /stock-items 初回表示TTFB短縮 — 設計ドキュメント

## 背景

本番iPhone PWAで `/stock-items` の初回表示時、白い画面が約3.4秒続くことが動画実測（フレーム解析）で確認された。`layout.tsx` の `export const instant = false` と `page.tsx` が `getInitialStockItems()` を境界なしでawaitする設計（design.md D2/D3: JS実行前の初期HTMLに実データを含める）により、**白画面時間はほぼそのままTTFB**になる。

TTFBの内訳をcurlで概算計測したところ、以下の3区間が現在すべて**直列**で発生している：

1. `middleware.ts`: `supabase.auth.getClaims()`（認証検証・必要ならセッションリフレッシュ）
2. `getInitialStockItems.ts`: `supabase.auth.getSession()`（middlewareと重複したSupabase呼び出し）
3. `getInitialStockItems.ts`: `fetchStockItems()`（Go Lambda backendへのフェッチ）

cold時の概算値（curl実測、`/api/health` 等の代替エンドポイント経由）: middleware単体 ~0.91s、Lambda leg ~1.19s。単純合算で3秒超となり、実測3.4秒と整合する。

既存のwarmup対策（cron-job.orgによる `/api/warm/stock-items` 2分間隔ping、Lambda `/health` 直叩き）は、実測でcronの内部fetch完了が実アクセスに対し約23秒遅れるケースが確認されており、実アクセスのタイミングを確実にカバーできていない。またVercelの `/stock-items` ページ関数（Node.js serverless）はAPI Routesとは別のコンピュートユニットであり、warmup用エンドポイントを叩いても保証されない。

このスペックはwarmup戦略の見直しではなく、**直列に発生している3区間そのものを削減・並列化する**ことで白画面時間を短縮することを目的とする。

## スコープ

- `frontend/` のみ。バックエンド（Go）は変更なし——GoバックエンドのJWT検証ロジックは変更しない前提
- 変更対象: `middleware.ts`、`getInitialStockItems.ts`
- 対象外（別issueとする）: cron-job.orgのwarmup頻度・ターゲット見直し

## 前提となる技術的制約

- Next.jsのmiddlewareとpage（Server Component）は同一リクエスト内で順番に実行される別フェーズであり、両者を跨いで並列実行することはできない
- Server Component（`page.tsx`）はcookieを書き換えられない。Supabaseのセッションリフレッシュ（cookie書き換えを伴う）は必ずmiddleware側で行う必要がある
- 上記2点から、「認証検証とLambdaフェッチの並列化」を実現するには、**Lambdaフェッチ自体をmiddleware側に移し、`getClaims()`と同一実行内で`Promise.all`する**構成を取る
- cold値の内訳（Supabase/Lambdaへの実ネットワーク往復 vs Vercel関数自体のコールドスタート）は現時点で外部curl計測のみでは切り分けられていない。この切り分けができないまま並列化を実装しても効果が正しく評価できないため、**観測性の追加を実装の最初のフェーズとする**

## 変更内容

### Phase 0: 観測性の追加（先行実装・判断ゲート）

`middleware.ts` と `getInitialStockItems.ts` に区間計測（Server-Timingヘッダー、もしくは構造化ログ）を追加し、以下を本番で実測できるようにする：

- `getClaims()` 自体の所要時間
- （既存の）`getSession()` 自体の所要時間
- `fetchStockItems()`（Lambda）自体の所要時間
- 上記3つの合計と、実際にブラウザが観測するTTFBとの差分（差分が大きければ、関数コールドスタート等プラットフォーム起因の割合が大きいと判断できる）

**判断ゲート:** このデータで「直列往復の削減が支配的コストを占める」ことを確認してから Phase 1 に進む。占めていなければ、並列化の設計自体を見直す（例: 関数のコールドスタート対策・バンドルサイズ削減など別のレバーを優先する）。

### Phase 1: 認証検証の一化 + Lambdaフェッチの並列発射

**`middleware.ts`:**
- `getSession()`（ローカルのcookie読み取り、通常はネットワーク往復なし）でアクセストークンを先に取り出す
- `getClaims()`（検証・必要ならリフレッシュ）と `fetchStockItems(token, activeGroupId)`（Lambda）を `Promise.all` で同時発射する
- `getClaims()` が未認証確定と判定した場合、並行して取得できていたLambda結果は破棄し、現行通り `/login` へリダイレクトする（データを一切forwardしない）
- 認証済みと判定できた場合、Lambdaフェッチが成功しかつペイロードサイズが閾値（暫定6KB、実装時に調整）以下であれば、結果をヘッダー（例: `x-pp-initial-items`）でpageへ引き継ぐ
- fail-open（判定不能）の場合は現行の判定基準を変えない。Lambda結果が実際に取得できていればforwardする（トークンが本当に無効ならGoバックエンド自身のJWT検証で元々弾かれているため、新たな安全性の低下はない）

**`getInitialStockItems.ts`:**
- `x-pp-initial-items` ヘッダーが存在すればパースしてそのまま返す（Supabase呼び出し・Lambda呼び出しを一切行わない）
- ヘッダーが存在しない場合（サイズ超過・フェッチ失敗・middleware側の異常等）は、現行同様のフォールバックフェッチを行う。ただし `getSession()` の再検証は行わず、cookieから直接トークンを読む（middlewareが既に検証・リフレッシュ済みのため）

## 変更しないもの

- Goバックエンドの独自JWT検証ロジック — 変更なし。今回の変更は「いつLambdaを叩くか」のタイミングのみで、認証の最終判定はこれまで通りバックエンド側が担う
- middlewareのcookieリフレッシュ・fail-open/fail-closed判定基準（Issue #260/#261対策）— ロジック自体は変更せず、並行してLambda呼び出しを追加するのみ
- `layout.tsx` の `export const instant = false` および `page.tsx` の「Suspense境界を置かない」設計（design.md D2/D3）— 維持する。ストリーミング化でTTFBを回避する方向は取らない

## 新たに生じるトレードオフ

- 未認証のリクエストに対してもLambdaへの発射が発生する（現行は認証確定後のみ）。Goバックエンド側の負荷はわずかに増えるが、無効JWTの即時rejectは軽量な処理であり、このルートの実トラフィック規模（低頻度、既存の記録による）を踏まえると許容範囲と判断する
- ペイロードサイズが閾値を超えた場合はヘッダー転送を諦めてフォールバックする。閾値超過の発生頻度はメトリクス/ログで可視化し、必要なら閾値や転送方式を見直す

## テスト方針

| スコープ | 内容 |
|---|---|
| Frontend Unit | middlewareの並列発射ロジック（`getClaims`/`fetchStockItems`をモックし、`Promise.all`の挙動・未認証時の破棄・ヘッダーサイズガードを検証） |
| Frontend Unit | `getInitialStockItems()` のヘッダー有無分岐（ヘッダーありの場合はSupabase/Lambda呼び出しが一切発生しないことをspyで確認） |
| E2E (既存・回帰確認) | `e2e/ssr-stock-items.spec.ts`（`javaScriptEnabled: false`）が変更後も無破壊で通ること（design.md D2/D3維持の担保） |
| Frontend Integration | 未認証セッションの場合にLambda結果がクライアントへ一切漏れないことの確認 |

## ロールアウト

1. Phase 0（観測性）をmainにマージ・本番投入し、Server-Timing実測データを一定期間収集する
2. データに基づき、Phase 1（並列発射の実装）に進むか設計を見直すかを判断する
3. Phase 1実装後、`e2e/ssr-stock-items.spec.ts` の回帰確認を必須とする
4. cron-job.orgのwarmup頻度・ターゲット見直しは、本スペックのスコープ外として別issueに切り出す
