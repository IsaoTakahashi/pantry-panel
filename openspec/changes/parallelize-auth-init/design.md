## Context

現状の起動シーケンス（`frontend/src/contexts/AuthContext.tsx`）:

1. `getSession()`（ローカル、`localStorage` の永続セッションを読むだけでネットワーク往復なし）
2. `loadGroups(accessToken)` → `GET /api/groups/me`（ネットワーク往復）
3. `applyGroups` で `group`（確定 `activeGroupId`）が決まり `loading=false`

`frontend/src/components/AuthGuard.tsx` は `StockItemsClient` が返す JSX の内側でツリーの一部だけをラップしており、`StockItemsClient` 自体や内部の `useStockItems` の呼び出しは `AuthGuard` の状態に関わらず常にマウント・実行される。実際に直列待ちを生んでいたのは `useStockItems` 自身のフェッチ effect 内にあった `authLoading` チェック（Decision 2 で撤廃）であり、`fetchStockItems` は `GET /api/groups/me` の応答を待たされてから開始していた。

`localStorage` の `pantry-panel:active-group-id`（`ACTIVE_GROUP_KEY`）には前回セッションで使っていたグループ ID がキャッシュされている。多くのユーザーは毎回同じグループを使うため、このキャッシュ値は groups 確定前の「推測値」として十分信頼できる。

## Goals / Non-Goals

**Goals:**
- `localStorage` にキャッシュされたグループ ID がある場合、`GET /api/groups/me` の応答を待たずに `GET /api/stock-items` を開始する
- キャッシュ値と確定値が一致すれば、先行取得した結果をそのまま採用し二重フェッチしない
- キャッシュ値と確定値が不一致（グループ切替・脱退・別アカウントの残留キャッシュ等）の場合、確定値で正しく再フェッチし、ユーザーに誤ったデータを見せない
- キャッシュが無い（初回ログイン等）場合は、現状と同じ「確定を待ってから fetch」に自然にフォールバックする

**Non-Goals:**
- `getSession()` 自体の高速化（既にローカル読み取りでネットワーク往復なし）
- `GET /api/groups/me` 自体のレスポンスタイム改善（Issue #237 の CORS Max-Age、将来のキャッシュ最適化は別 Issue）
- Realtime 購読タイミングの変更
- 認証の cookie 化・SSR 化（Issue #182 の範囲）

## Decisions

### 1. AuthGuard のレンダーゲートを「confirmed group」から「session + (confirmed group または speculative group)」に緩和する

**決定:** `AuthGuard` は `loading` を待たず、`session` があり `group`（確定）または `speculativeGroupId`（推測）のいずれかがあれば children をレンダーする。`loading` が `false` になった時点で `group` が無ければ（＝キャッシュも確定値も無かった、または脱退済み）初めて `/no-group` へ遷移する。

**理由:** 当初は「呼び出し元コンポーネントがマウントされていなければ `useStockItems` を早くフェッチさせても意味がない」という前提で AuthGuard のゲートが直列待ちの実体だと考えていたが、実際には `StockItemsClient` 自体は常にマウントされており、直列の実体は Decision 2 で撤廃した `useStockItems` 内の `authLoading` チェックだった（Context 節を参照）。そのためこの変更自体は Issue #236 の効果に対して inert（無害だが必須ではない）である。それでも維持する理由は、`group=null` かつ未確定の間 `AuthGuard` が `null` を返し続けるより、`speculativeGroupId` がある場合は早期に子要素をレンダーする方が将来 AuthGuard 単体の意味論として一貫しており、Decision 5（`speculativeGroupId` の同期）と組み合わせることで実害のない設計になるため。

**検討した代替案:**
- *AuthGuard は変えず、`stock-items/page.tsx` にフェッチ専用の隠しコンポーネントを追加してAuthGuardの外側でプリフェッチする* → フェッチ結果を `useStockItems` の state に橋渡しする仕組み（context 経由のキャッシュ等）が別途必要になり複雑。AuthGuard 自体を賢くする方が変更が一箇所に閉じる。
- *AuthGuard を完全に撤廃し、各ページが自分でリダイレクト判定する* → 影響範囲が全ページに広がるため見送り。今回は条件緩和のみに留める。

**影響:** `group=null` かつ `loading=true` の間、`StockItemsClient` 配下のコンポーネント（`GroupSwitcher` 等）が一時的に `group=null` 相当の表示（例: 「グループなし」）を見せる可能性がある。既存コンポーネントは `GroupInfo | null` を受け付ける設計のため実装上は安全（クラッシュしない）。UX 上のちらつきは Risks で扱う。

### 2. `useStockItems` のフェッチ起点を「確定 `activeGroupId`」から「`effectiveGroupId`（確定値 ?? 推測値）」に変更する

**決定:** 呼び出し元（`StockItemsClient`）で `effectiveGroupId = group?.groupId ?? speculativeGroupId` を計算して渡す。`useStockItems` は `accessToken` と `effectiveGroupId` が揃った時点でフェッチし、`authLoading` 引数は fetch のゲートには使わない（groups 確定後に `effectiveGroupId` の値そのものが変わるため、`useEffect` の依存配列変化で自然に再フェッチが起きる）。

**理由:** 確定値と推測値を同じ「フェッチに使う groupId」として扱うことで、一致時は依存配列の値が変わらず React が自動的に再実行をスキップ（＝二重フェッチしない）、不一致時は値が変わって自動的に再フェッチされる。専用の dedup フラグや比較ロジックを新設する必要がない。

**検討した代替案:**
- *`speculativeFetch()` と `confirmedFetch()` を別関数として持ち、明示的に一致判定して分岐する* → ロジックが増え、`AuthContext.loadGroups` の `loadedTokenRef` パターンのような手動 dedup 管理が必要になる。依存配列の値そのものを一本化する方が単純。

### 3. 推測フェッチと確定フェッチの競合（race）はフェッチ effect 内の cancel フラグで防ぐ

**決定:** `useStockItems` のフェッチ `useEffect` に `let cancelled = false` を持たせ、`effectiveGroupId` が変わって effect が再実行された際、古い effect のフェッチ結果は `cancelled` チェックで state に反映しない（cleanup で `cancelled = true` にする）。

**理由:** 推測フェッチ（キャッシュの groupId）と確定フェッチ（groups 確定後の groupId）が短時間に連続して発火しうる。ネットワーク応答順序は保証されないため、確定フェッチより後に推測フェッチの古い応答が返ると誤ったグループのデータで上書きしてしまう。既存コードにはこのガードが無いが、今回の変更で発火頻度が上がるため追加する。

### 4. 推測フェッチが失敗（403等）してもエラーを表示しない

**決定:** `effectiveGroupId` が「推測値」段階（`authLoading === true` かつ `group` 未確定）でのフェッチが失敗した場合、`error` state をセットしない。確定フェッチの結果（成功/失敗）のみを `error` に反映する。

**理由:** キャッシュされたグループが古くなっている（脱退済み・別アカウントの残留キャッシュ）ケースでは 403 等のエラーが起こり得るが、これは実装の都合であってユーザーが気にすべきエラーではない。確定値でのフェッチが正となる。

### 5. `speculativeGroupId` は `AuthContext` が公開する

**決定:** `ACTIVE_GROUP_KEY` の読み書きは既に `AuthContext` に閉じているため、`speculativeGroupId`（マウント時に `localStorage` から同期的に読む一度きりの値）も `AuthContext` の公開値として追加する。`signOut` 時と `switchGroup` 時に合わせて更新し、context の値が実際の `localStorage` 状態と乖離しないようにする。

## Risks / Trade-offs

- **[Risk] 推測グループが確定グループと異なる場合、一瞬「別グループのデータ」が画面にちらつく可能性** → Decision 3 の cancel フラグで最終的な描画は確定データに収束する。ちらつき自体は許容（現状「白画面→スケルトン→表示」の待ち時間そのものを削るのが目的であり、稀なケースでの数百ms のちらつきは許容範囲と判断）。テスト設計でこのシナリオを明示的に検証する。
- **[Risk] AuthGuard のゲート緩和により `group=null` の間 `GroupSwitcher` が「グループなし」を一瞬表示する** → 既存コンポーネントは null-safe。UI 上の軽微なちらつきに留まり、機能的な破綻はない。将来的に気になれば `authLoading` を渡して skeleton 化する改善は別 Issue とする。
- **[Risk] `localStorage` の推測値が別アカウント・別デバイス間で誤って使い回されるケース（共有デバイス）** → RLS により誤ったグループへのアクセスは 403 で弾かれる。Decision 4 によりエラー表示はされず、確定フェッチが正しいデータで上書きする。実害はデータ露出ではなく無駄な 1 回の API 呼び出しのみ。
- **[Trade-off] `useStockItems` のシグネチャ変更（`activeGroupId` → `effectiveGroupId`、`authLoading` 引数の役割変更）により呼び出し元・テストの更新が必要** → 影響範囲は `StockItemsClient.tsx` と関連テストのみ。

## Migration Plan

- Feature flag 不要（振る舞いの変更はキャッシュの有無に応じて自然にフォールバックするため、段階的ロールアウトの必要性は低い）
- ロールバック手段: 本変更は単一 PR に閉じる想定のため、問題があれば PR revert で旧来の直列フローに戻せる
- デプロイ後、本番環境で Issue #179 と同様の手法（Playwright + curl 実測）で `skeleton → 商品表示` までの時間を再計測し効果を確認する

## Open Questions

- なし（実装前確認で解消済み）
