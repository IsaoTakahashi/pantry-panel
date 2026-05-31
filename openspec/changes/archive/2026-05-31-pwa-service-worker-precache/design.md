## Context

現状の Frontend (Next.js 16 App Router on Vercel) は PWA manifest を配信しているが Service Worker を持たない。ホーム画面から起動するたびに Vercel CDN / Lambda / Supabase へ DNS+TLS+HTML+CSS+JS の全取得が走り、特にモバイル網のセッション切れ後の再起動で 600ms〜数秒の白画面が発生する（GitHub Issue #179）。

本変更で SW を導入し、shell と静的アセットを pre-cache することで PWA 再起動を体感即時化する。

### 関連スペック / 制約

- 既存 spec: `frontend-pwa`（manifest, icons, start_url, theme color）
- Next.js: `16.2.4`、App Router、`cacheComponents: true`
- Tailwind v4 + Biome 2.4 + Vitest + Playwright
- デプロイ: Vercel Production / Preview branches
- 認証: Supabase JS SDK（localStorage 派、トークンはクライアント保持）
- リアルタイム: Supabase Realtime（WebSocket、`fetch` ではないので SW 対象外）

## Goals / Non-Goals

**Goals:**
- PWA 再起動の skeleton 描画時間を <100ms に短縮する（2 回目以降）
- 静的アセットを pre-cache してオフラインでも shell が出るようにする
- 既存 PWA インストールはそのまま維持する（再追加不要）
- 既存 E2E が壊れない

**Non-Goals:**
- オフライン時の商品データ閲覧機能（API は network-first、API 不通時のエラー表示は既存挙動を踏襲）
- 商品データの SW キャッシュ（Server Component 化は #182 で別途）
- Web Push 通知（将来検討）
- Background Sync で書き込みをキューイング（将来検討）

## Decisions

### Decision 1: SW フレームワークは `@serwist/next` を採用する

**選択肢:**
- (A) `@serwist/next`（Workbox の Next.js 16 + App Router 対応フォーク、active 開発）
- (B) `next-pwa`（旧来定番だが App Router で複数 issue が未解決）
- (C) 素の Workbox + 手動 registration
- (D) Service Worker をスクラッチ実装

**採用:** A

**理由:**
- Next.js 16 / App Router での実績があり active メンテ
- pre-cache のための manifest 生成・register 用 helper が揃っており、Next の build 出力（`.next/static/chunks/*` のハッシュ名）を自動で取り込める
- ランタイムキャッシュ戦略（NetworkOnly / CacheFirst / StaleWhileRevalidate）が宣言的
- スクラッチは学習コストとメンテコストが高い

**前提確認:** `npm view @serwist/next versions` で App Router 対応版を確認してから導入する（最新安定版を選定）

### Decision 2: API レスポンスは NetworkOnly（キャッシュしない）

**選択肢:**
- (A) NetworkOnly — 常にネットワーク取得、SW は素通し
- (B) NetworkFirst with fallback — 失敗時のみキャッシュ返却
- (C) StaleWhileRevalidate — キャッシュ返却 + 裏で再取得

**採用:** A

**理由:**
- 在庫データは複数人で共有 → 古いデータを返すとユーザー混乱の原因
- B/C は同期失敗時にも古い表示が出てしまい、Realtime 連携と矛盾する
- 「オフラインで在庫を見たい」は本変更の Non-Goal
- 後で必要になれば B に切り替え可能

### Decision 3: 静的アセットは CacheFirst（ハッシュ付きファイル名前提）

**選択肢:**
- (A) CacheFirst — キャッシュ最優先、無ければ network
- (B) StaleWhileRevalidate — キャッシュ + 裏で更新

**採用:** A

**理由:**
- Next.js の `_next/static/chunks/*` はファイル名にハッシュを含む → ファイル内容が変わると別 URL になる
- 同 URL は永続キャッシュで安全
- ハッシュ無しのファイル（`/favicon.ico`, `/icon-*.png`, `/manifest.webmanifest`）も低頻度更新なので CacheFirst で十分

### Decision 4: SW 更新は skipWaiting + clients.claim で即時反映

**選択肢:**
- (A) skipWaiting + clientsClaim — 新 SW が install 直後に有効化
- (B) ユーザーにバナーで通知 → 同意後に有効化
- (C) ブラウザ標準（次回ナビゲーションで有効化）

**採用:** A

**理由:**
- ユーザーが「PWA 再起動が重い」を体感するたびに我慢している現状を解消するのが本変更の目的
- 通知 UI を実装するコストが大きい
- 静的アセットはハッシュ付きで競合しない（古い shell が新 chunk を呼ぶ問題は発生しにくい）
- 万一の不整合は、ユーザーが再起動すれば解消する

### Decision 5: 開発時 (`npm run dev`) は SW を無効化

**理由:**
- HMR と SW のキャッシュが競合する
- `@serwist/next` の `disable: process.env.NODE_ENV === "development"` 相当で無効化

### Decision 6: Playwright E2E では SW を block する

**選択肢:**
- (A) `context.serviceWorkers: "block"` で SW を完全無効化（テスト中の挙動を SW 影響から切り離す）
- (B) 各テスト前に SW を unregister
- (C) SW 込みでテストする（インテグレーション網羅）

**採用:** A（既存テストの大半）+ 別途 SW 専用 E2E を 1 ファイル用意（C 相当）

**理由:**
- 既存 E2E は SW を意識せず書かれている → block しないと stale データで flaky になるリスク
- SW 固有の挙動（pre-cache、更新）は別ファイルで集中テスト

## Risks / Trade-offs

- **Risk: 既存 PWA ユーザーへの新 SW 配布が遅延する** → 初回起動で SW が install、2 回目で activate。デプロイ告知不要だが「効果がすぐ出ない」を README / Issue に明記する
- **Risk: ハッシュ無しの shell HTML がキャッシュされて新 chunk リンクと食い違う** → `start_url` の HTML はキャッシュ戦略を **StaleWhileRevalidate** にして、表示は速く・裏で更新する
- **Risk: SW のバグで本番影響が出た時の rollback が難しい（ユーザー側 SW が居座る）** → Mitigation: `/sw.js` を空ファイルに差し替える emergency unregister 手順を design に記載 / Vercel ロールバックで shell は戻る
- **Risk: `cacheComponents: true` と Workbox のキャッシュ生成タイミングが干渉する** → `next build` 出力を SW に取り込むだけなので原則影響なし。CI で `npm run build` が通ることを確認
- **Risk: iOS Safari の PWA で SW スコープ問題** → 検証必須。`navigator.serviceWorker.register('/sw.js', { scope: '/' })` で root スコープを明示
- **Trade-off:** SW 導入によりバンドルに数 KB（registration script + Workbox runtime）が増える。性能改善効果と比較して無視できる

## Migration Plan

1. **依存追加**: `@serwist/next` を `npm view` で最新版を確認して導入
2. **SW ソース実装**: `frontend/src/sw.ts` を作成（pre-cache + ランタイム戦略）
3. **next.config.ts ラップ**: `withSerwist({ swSrc, swDest, ... })` で本番ビルドのみ SW を生成
4. **registration**: `frontend/src/app/layout.tsx` または専用 client component で `navigator.serviceWorker.register('/sw.js')` を呼ぶ（dev では no-op）
5. **Playwright 設定**: 既存 project に `serviceWorkers: "block"` を追加
6. **SW 専用 E2E 追加**: 別 fixture で SW 有効状態の pre-cache を確認
7. **CI 通過確認**（lint / vitest / playwright mock / build）
8. **PR review → main マージ → Vercel 自動デプロイ**
9. **本番計測**: Issue #179 と同じ手順で skeleton 描画時間を再計測、結果を Issue にコメント

### Rollback

- Vercel Dashboard で前バージョンに revert すれば `/sw.js` が 404 に戻る
- ただしユーザー側にインストール済の SW は次回起動まで残る → 緊急時は SW を「全 fetch を素通しさせる空 SW」に差し替えて配信 (`/sw.js` を 1 行 SW にする)
