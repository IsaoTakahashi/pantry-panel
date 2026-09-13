## 1. Phase 0: 観測性の追加（判断ゲート）

- [x] 1.1 `middleware.ts` に `getClaims()` の実行時間を計測するコードを追加し、Server-Timingヘッダー（または構造化ログ）で出力する。ユニットテストでヘッダー/ログが付与されることを確認する
- [ ] 1.2 `getInitialStockItems.ts` に既存の `getSession()` と `fetchStockItems()` それぞれの実行時間を計測するコードを追加し、同様に出力する。ユニットテストで確認する
- [ ] 1.3 変更をmainにマージ・本番デプロイし、実アクセスのServer-Timingデータを一定期間（数日〜1週間程度）収集する
- [ ] 1.4 収集データから、cold時の遅延が「Supabase/Lambdaへの実ネットワーク往復」由来か「Vercel関数自体のコールドスタート」由来かを判断し、ユーザーに報告してPhase 2着手の可否を確認する（設計の判断ゲート。Phase 2着手前に必ずユーザー確認を挟む）

## 2. Phase 2: 認証検証の一化

- [ ] 2.1 `getInitialStockItems.ts` から `supabase.auth.getSession()` 呼び出しを削除し、middlewareが検証・リフレッシュ済みのcookieから直接アクセストークンを読み取るように変更する。ユニットテストで、この経路でSupabaseへの呼び出しが発生しないことをspyで確認する

## 3. Phase 2: middleware内での並列発射とヘッダー伝達

- [ ] 3.1 `middleware.ts` 内で `getSession()`（ローカルのcookie読み取り）からアクセストークンと `activeGroupId` を取得し、`getClaims()` と `fetchStockItems()` を `Promise.all` で並列発射する
- [ ] 3.2 認証済みと判定できた場合、フェッチ結果をシリアライズして `x-pp-initial-items` ヘッダーに付与する。サイズ閾値（暫定6KB、実データ分布を見て調整）を超える場合は付与しないロジックを実装し、ユニットテストで閾値前後双方の挙動を確認する
- [ ] 3.3 `getClaims()` が未認証確定と判定した場合、取得済みのLambda結果を破棄し `x-pp-initial-items` ヘッダーを付与しないことをユニットテストで確認する（未認証確定時にデータが応答に含まれないことの直接的な確認）
- [ ] 3.4 fail-open（判定不能）時の挙動は既存のredirect基準を変更せずに実装し、既存の該当ユニットテストが全て通ることを確認する

## 4. Phase 2: pageでのヘッダー読み取りとフォールバック

- [ ] 4.1 `getInitialStockItems.ts` で `x-pp-initial-items` ヘッダーの有無を確認し、存在すればパースしてそのまま返す。ユニットテストで、この経路では追加のSupabase呼び出し・Lambda呼び出しが一切発生しないことをspyで確認する
- [ ] 4.2 ヘッダーが存在しない場合（サイズ超過・フェッチ失敗・middleware側の異常等）のフォールバックフェッチを実装し、ユニットテストで確認する

## 5. 回帰確認

- [ ] 5.1 `cd frontend && npx playwright test e2e/ssr-stock-items.spec.ts` を実行し、`javaScriptEnabled: false` でも初期HTMLに実データが含まれることを確認する（design.md D2/D3の維持を担保）
- [ ] 5.2 `cd frontend && npm test` で既存のmiddleware/AuthGuard関連ユニット・統合テストが全て通ることを確認する
- [ ] 5.3 `gh pr checks --watch` でPR上のCI結果を確認する
