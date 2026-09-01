## 1. 事前調査(実装前に確認)

- [ ] 1.1 `frontend/src/contexts/AuthContext.tsx` の `ACTIVE_GROUP_KEY` 読み書き箇所(`applyGroups`, `signOut`, `switchGroup`)を再確認し、`speculativeGroupId` を追加する箇所を特定する
- [ ] 1.2 `frontend/src/components/AuthGuard.tsx` の現行ゲート条件・リダイレクト条件を再確認する
- [ ] 1.3 `frontend/src/app/stock-items/useStockItems.ts` のフェッチ effect(`authLoading` / `activeGroupId` 依存)と `frontend/src/app/stock-items/StockItemsClient.tsx` の呼び出し箇所を確認する
- [ ] 1.4 既存テスト(`AuthContext.test.tsx`, `AuthGuard.test.tsx`, `useStockItems.test.ts` 等)のファイル有無とテストパターンを確認する

## 2. AuthContext: speculativeGroupId の公開

- [ ] 2.1 `speculativeGroupId` の期待挙動(マウント時に `localStorage` から同期的に読む、`signOut` でクリア、`switchGroup` で更新)のテストを追加する
- [ ] 2.2 `AuthContextValue` に `speculativeGroupId: string | undefined` を追加し、`useState` の lazy initializer で `localStorage.getItem(ACTIVE_GROUP_KEY)` を読む
- [ ] 2.3 `signOut` で `speculativeGroupId` を `undefined` にリセットする
- [ ] 2.4 `switchGroup` で `speculativeGroupId` を新しい `groupId` に更新する
- [ ] 2.5 テストが green になることを確認する

## 3. AuthGuard: ゲート条件の緩和

- [ ] 3.1 `openspec/changes/parallelize-auth-init/specs/auth-guard/spec.md` の全シナリオに対応するテストを `AuthGuard.test.tsx` に追加する(session+group で即レンダー、session+speculativeGroupIdのみでレンダー、両方無ければ待機、loading完了後の確定状態のみでリダイレクト判断)
- [ ] 3.2 レンダー条件を `!loading` から `session && (group || speculativeGroupId)` に変更する
- [ ] 3.3 リダイレクト用 `useEffect` の条件を「`loading` が `false` になった後の確定 `session`/`group` のみで判断する」よう変更し、`speculativeGroupId` はリダイレクト判定に使わないことを確認する
- [ ] 3.4 テストが green になることを確認する

## 4. useStockItems: effectiveGroupId 対応と race 制御

- [ ] 4.1 `stock-items-client-hook` の MODIFIED/ADDED requirements に対応するテストケースを `useStockItems.test.ts` に追加する(推測groupIdでの先行フェッチ、確定値一致時は再フェッチしない、不一致時は再フェッチする、推測フェーズの失敗はerrorに反映しない、遅延応答が確定結果を上書きしない)
- [ ] 4.2 シグネチャを `useStockItems(accessToken, effectiveGroupId, refreshGroup, isGroupConfirmed)` へ変更する(`authLoading` の代わりに「groupId が確定値かどうか」を示すフラグを受け取る形に整理)
- [ ] 4.3 フェッチ用 `useEffect` の依存配列を `effectiveGroupId` ベースに変更し、`let cancelled = false` による cancel ガードを実装する(cleanup で `cancelled = true`)
- [ ] 4.4 推測フェーズ(`isGroupConfirmed === false`)でのフェッチ失敗時は `setError` を呼ばないよう分岐する
- [ ] 4.5 テストが green になることを確認する

## 5. StockItemsClient: 呼び出し側の配線

- [ ] 5.1 `speculativeGroupId` を `useAuth()` から取得し、`effectiveGroupId = group?.groupId ?? speculativeGroupId` を計算して `useStockItems` に渡すよう変更する
- [ ] 5.2 `isGroupConfirmed = group != null` を計算して渡す
- [ ] 5.3 既存の `StockItemsClient` 関連テストを新しい props/挙動に合わせて更新する
- [ ] 5.4 テストが green になることを確認する

## 6. ローカルE2E確認

- [ ] 6.1 `cd frontend && npm run dev` でローカルサーバーを起動する
- [ ] 6.2 `npx playwright test` を実行し、stock-items 系・auth 系の既存 E2E が pass することを確認する
- [ ] 6.3 group=null の間の `GroupSwitcher` の一時的な「グループなし」表示が既存 E2E のアサーションに影響していないか確認する(影響があれば該当テストに待機を追加する)

## 7. CI確認・効果検証

- [ ] 7.1 commit のたびに push し、PR 上の CI が最新状態であることを確認する
- [ ] 7.2 `gh pr checks --watch` で CI が green になることを確認する
- [ ] 7.3 本番デプロイ後、Issue #179 と同様の手法(Playwright + curl)で `skeleton → 商品表示` までの時間を再計測し、Issue #236 に効果を記録する
