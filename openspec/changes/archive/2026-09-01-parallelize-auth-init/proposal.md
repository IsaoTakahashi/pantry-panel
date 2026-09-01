## Why

起動時の認証初期化が `getSession → groups 取得 → stock-items 取得` の直列構造になっており、各段でネットワーク往復（groups 取得は `/api/groups/me`、stock-items 取得は `/api/stock-items`）が発生する。モバイル回線では RTT が積み重なり、初回表示までの体感遅延の主要因になっている（Issue #179 epic の実測・PR #217 調査で判明、Issue #236）。`localStorage` にキャッシュ済みの `active-group-id` を使えば、groups の確定を待たずに stock-items の取得を先行開始でき、直列待ち時間をモバイル RTT 1 往復分削減できる。

## What Changes

- `AuthContext` から、`localStorage` にキャッシュされた `active-group-id`（groups 取得結果による確定前の「推測値」）を `speculativeGroupId` として公開する
- `useStockItems` は `activeGroupId`（確定値）を待たず、`accessToken` と `speculativeGroupId` が揃った時点で stock-items の先行 fetch を開始する
- groups 取得が完了し確定 `activeGroupId` が判明した時点で、`speculativeGroupId` と一致していれば先行 fetch の結果をそのまま採用し、不一致（グループ切替・脱退・初回訪問でキャッシュなし等）であれば確定 `activeGroupId` で再フェッチする
- 先行 fetch がエラー（403 など、キャッシュされた group から既に外れている場合）になっても、確定前は `error` state に反映せず、確定 `activeGroupId` での再フェッチ結果を待つ

## Capabilities

### New Capabilities
- `auth-guard`: `AuthGuard` コンポーネントの認証・認可ゲート条件（レンダー可否・リダイレクト条件）を定義する。既存の spec には未記載だったため新規に切り出す

### Modified Capabilities
- `stock-items-client-hook`: `useStockItems` の fetch 開始条件が「`accessToken` と確定 `activeGroupId` が揃う」から「`accessToken` と `speculativeGroupId`（未確定でも可）が揃う」に変わり、確定後に不一致なら再フェッチする振る舞いが追加される

## Impact

- `frontend/src/contexts/AuthContext.tsx`: `speculativeGroupId` の公開(`loading` を待たず `localStorage` から同期的に読む)
- `frontend/src/components/AuthGuard.tsx`: レンダーゲート条件を `!loading` から `session && (group || speculativeGroupId)` へ緩和
- `frontend/src/app/stock-items/useStockItems.ts`: fetch トリガー条件・再フェッチロジックの変更
- `frontend/src/app/stock-items/useStockItems.test.ts` ほか関連テスト: 新しい fetch タイミング・再フェッチ挙動のテスト追加
- 既存 E2E（stock-items 系）: 挙動に回帰がないことの確認
