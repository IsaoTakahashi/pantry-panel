## Why

モバイルで `/stock-items` を開くと、スケルトン表示のままデータがロードされない事象が発生している。プライベートタブ（Service Worker 非登録）では再現しないことから、root cause は **Service Worker のキャッシュ戦略**にある。新しい Vercel デプロイ後、SW が「最初の訪問時点の古い shell HTML（`/stock-items` を `revision: null` で pre-cache）」を返し、その HTML が参照する古い `_next/static/chunks/*.js` は origin から削除済みのため 404 → 遅延読み込み（Suspense）が解決できず ChunkLoadError でスケルトンのまま固まる。

## What Changes

- **shell HTML の pre-cache を見直す**: `/stock-items` を `revision: null` で pre-cache するのをやめ、デプロイをまたいで古い chunk ハッシュを参照する HTML が永久に残らないようにする
- **document のランタイムキャッシュ戦略を StaleWhileRevalidate → NetworkFirst に変更**する。オンライン時は常に最新 HTML（=有効な chunk ハッシュ）を取得し、オフライン時のみキャッシュにフォールバックする
- **ChunkLoadError からの自己回復を追加**する: chunk 読み込み失敗を検知したら、キャッシュ削除＋SW 解除のうえ一度だけリロードする（無限ループ防止のガード付き）。すでに壊れた状態で固まっている既存端末を次回アクセスで救済する **BREAKING**（SW ランタイム挙動の変更）
- 既存の SW spec（`frontend-pwa`）のうち、staleness を生む要件（shell HTML pre-cache / document = StaleWhileRevalidate）を更新する

## Capabilities

### New Capabilities

（なし。既存 capability の要件変更で対応する）

### Modified Capabilities

- `frontend-pwa`: Service Worker のキャッシュ戦略を変更する。具体的には (1) `/stock-items` shell HTML の pre-cache（`revision: null`）を削除、(2) document destination のランタイム戦略を StaleWhileRevalidate から NetworkFirst へ変更、(3) ChunkLoadError 検知時の自己回復（cache 削除＋SW 解除＋一度きりリロード）を新規追加

## Impact

- `frontend/next.config.ts`: `additionalPrecacheEntries` から `/stock-items` を除外
- `frontend/src/sw.ts`: document destination の handler を NetworkFirst に変更
- `frontend/src/`: ChunkLoadError を検知して自己回復するクライアント側ロジックを追加（例: `ServiceWorkerRegister` 近辺、または専用ユーティリティ）
- `frontend/src/sw.config.test.ts` / `sw.precache.test.ts`: 戦略・pre-cache 内容のテストを更新
- 新規テスト: ChunkLoadError 自己回復の unit テスト
- オフライン初回ナビゲーション挙動が変わる（pre-cache 即時表示 → NetworkFirst：初回オンライン取得後はキャッシュで動作）
