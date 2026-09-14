## 1. Phase 0: 観測性の追加（判断ゲート）

- [x] 1.1 `middleware.ts` に `getClaims()` の実行時間を計測するコードを追加し、Server-Timingヘッダー（または構造化ログ）で出力する。ユニットテストでヘッダー/ログが付与されることを確認する
- [x] 1.2 `getInitialStockItems.ts` に既存の `getSession()` と `fetchStockItems()` それぞれの実行時間を計測するコードを追加し、同様に出力する。ユニットテストで確認する
- [x] 1.3 変更をmainにマージ・本番デプロイし、実アクセスのServer-Timingデータを収集する（PR #297）
- [x] 1.4 収集データから、cold時の遅延が「Supabase/Lambdaへの実ネットワーク往復」由来か「Vercel関数自体のコールドスタート」由来かを判断し、ユーザーに報告する（設計の判断ゲート）。**結果: どちらでもなく、Vercel Node.js serverless functionが`iad1`(米国東海岸)で実行されており、`ap-northeast-1`(東京)のGo Lambda/Supabaseへの呼び出しが太平洋横断の往復になっていたことが判明。Phase 2着手前にPhase 1(Function Region修正)を優先して実施する方針をユーザーが承認**

## 2. Phase 1: Vercel Function Regionの修正（最優先）

- [x] 2.1 `frontend/vercel.json` を新規作成し、`{"regions": ["hnd1"]}` を設定する
- [x] 2.2 mainにマージ・本番デプロイし、`curl -sI https://pantry-panel-xi.vercel.app/api/health` 等の `x-vercel-id` ヘッダーで実行リージョンが `hnd1` になったことを確認する（PR #298。`hnd1::hnd1::...`となり`iad1`が消えたことを確認済み）
- [x] 2.3 デプロイ後、Phase 0の計測ログ（`getInitialStockItems: fetchStockItems;dur=...`, middlewareの`Server-Timing: claims;dur=...`）を一定時間収集し、修正前(median 521ms/p90 653ms)と比較して`fetchStockItems`の所要時間が有意に短縮されたことを確認し、ユーザーに報告する。**結果(2026-09-14、デプロイから約24時間後の実測): median 51.8ms/p90 70ms/max 118.6ms(n=30、直近1時間分)。修正前と比べて約10倍の短縮で、24時間を通して安定している。`get_runtime_errors`でエラーも0件。**Vercel(Hobbyプラン)のログ取得は`ExceedsBillingLimitError`により直近1〜2時間程度に制限されており、深夜帯等のより古いサンプルは遡って確認できないという制約が判明した。

## 3. Phase 2: 認証検証の一化

- [x] 3.1 `getInitialStockItems.ts` から `supabase.auth.getSession()` 呼び出しを削除し、middlewareが検証・リフレッシュ済みのcookieから直接アクセストークンを読み取るように変更する。ユニットテストで、この経路でSupabaseへの呼び出しが発生しないことをspyで確認する

## 4. Phase 2: middleware内での並列発射とヘッダー伝達

- [x] 4.1 `middleware.ts` 内で `getSession()`（ローカルのcookie読み取り）からアクセストークンと `activeGroupId` を取得し、`getClaims()` と `fetchStockItems()` を `Promise.all` で並列発射する（実装ではトークン取得を `readAccessTokenFromCookies()` に変更。理由は最終報告に記載）
- [x] 4.2 認証済みと判定できた場合、フェッチ結果をシリアライズして `x-pp-initial-items` ヘッダーに付与する。サイズ閾値（暫定6KB、実データ分布を見て調整）を超える場合は付与しないロジックを実装し、ユニットテストで閾値前後双方の挙動を確認する
- [x] 4.3 `getClaims()` が未認証確定と判定した場合、取得済みのLambda結果を破棄し `x-pp-initial-items` ヘッダーを付与しないことをユニットテストで確認する（未認証確定時にデータが応答に含まれないことの直接的な確認）
- [x] 4.4 fail-open（判定不能）時の挙動は既存のredirect基準を変更せずに実装し、既存の該当ユニットテストが全て通ることを確認する

## 5. Phase 2: pageでのヘッダー読み取りとフォールバック

- [x] 5.1 `getInitialStockItems.ts` で `x-pp-initial-items` ヘッダーの有無を確認し、存在すればパースしてそのまま返す。ユニットテストで、この経路では追加のSupabase呼び出し・Lambda呼び出しが一切発生しないことをspyで確認する
- [x] 5.2 ヘッダーが存在しない場合（サイズ超過・フェッチ失敗・middleware側の異常等）のフォールバックフェッチを実装し、ユニットテストで確認する

## 6. 回帰確認

- [ ] 6.1 `cd frontend && npx playwright test e2e/ssr-stock-items.spec.ts` を実行し、`javaScriptEnabled: false` でも初期HTMLに実データが含まれることを確認する（design.md D2/D3の維持を担保）
- [ ] 6.2 `cd frontend && npm test` で既存のmiddleware/AuthGuard関連ユニット・統合テストが全て通ることを確認する
- [ ] 6.3 `gh pr checks --watch` でPR上のCI結果を確認する
