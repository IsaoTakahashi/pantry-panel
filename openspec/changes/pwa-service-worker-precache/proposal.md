## Why

PWA を「ホームに追加」して再起動するたびに **600ms〜数秒の白画面**が出る。本番計測の結果、原因は Lambda コールドスタートではなく **Service Worker が無いため毎回フルのネットワーク取得が走る**ことが判明した（GitHub Issue #179 / #180 参照）。SW を導入して shell と静的アセットを pre-cache すれば、PWA 再起動は理論上 <100ms で skeleton が描画でき、オフラインや低速網でも体感が大きく改善する。

## What Changes

- `frontend/` に **Service Worker** を導入する（`@serwist/next` を利用、App Router 対応）
- 静的アセット（HTML shell, CSS, JS chunks, fonts, icons）を **install 時に pre-cache** する
- ランタイムキャッシュ戦略を設定する:
  - `/api/*` (Lambda API): **NetworkOnly**（古い在庫データを返さないため）
  - 静的アセット (`/_next/static/*`, `/icon-*.png`, `/favicon.ico`): **CacheFirst**
  - Supabase Realtime (WebSocket): SW のスコープ外（fetch ではないため自動的に対象外）
- SW の **install → wait → activate** ライフサイクルに従い、新バージョン配信時は `skipWaiting()` で即時更新する
- 開発時 (`npm run dev`) は SW を無効化する
- 既存 E2E (`mock` / `preview`) で SW 起因の干渉が無いか確認する
- **BREAKING** はなし。既存の PWA インストールはそのまま維持される

## Capabilities

### New Capabilities
- なし（既存の `frontend-pwa` を拡張する）

### Modified Capabilities
- `frontend-pwa`: PWA は Service Worker を登録し、shell と静的アセットを pre-cache する要件を追加する

## Impact

- **追加ファイル**: SW ソース (`frontend/src/sw.ts` or `frontend/app/sw.ts`)、registration コンポーネント
- **設定変更**: `next.config.ts` に `withSerwist` ラッパーを追加。`package.json` に `@serwist/next` 依存を追加
- **公開アセット**: `/sw.js` が新規に配信される（現在は 404）
- **既存 E2E**: SW がブラウザに残ることで stale なテスト結果を返す可能性 → Playwright の `serviceWorkers: "block"` 設定 or テスト前後の SW unregister を検討
- **デプロイ後の挙動**:
  - 既存 PWA インストールは保持される（再追加不要）
  - デプロイ直後の 1 回目の起動は今と同等の速度（SW 取得 + pre-cache 実行）
  - 2 回目以降の起動から効果発現
