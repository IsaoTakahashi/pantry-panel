## 1. 事前準備とテスト設計

- [x] 1.1 `npm view @serwist/next versions --json` で最新安定版を確認しバージョンを決定する (→ 9.5.11 stable, peer next>=14.0.0)
- [x] 1.2 Next.js 16 / App Router での `@serwist/next` の最小サンプルをドキュメントで確認する (→ withSerwistInit + app/sw.ts + defaultCache パターン)
- [x] 1.3 テスト設計 sub-agent を起動し、`.claude/rules/testing.md` のハイブリッドフォーマットで proposal.md に「ユーザーシナリオとテスト設計」セクションを追加する → ユーザーレビュー (→ 13 シナリオ追加・レビュー OK)
- [x] 1.4 GitHub Issue #180 から branch `180-pwa-service-worker-precache` を作成し、Draft PR を起こす (→ Draft PR #183)

## 2. 依存追加と設定

- [x] 2.1 `frontend/package.json` に `@serwist/next` を追加（dev/runtime の必要な分割で） (→ `@serwist/next@9.5.11` + `serwist@9.5.11` devDependencies)
- [x] 2.2 `frontend/next.config.ts` を `withSerwist` でラップする（disable: NODE_ENV === "development"） (→ `withSerwistInit` + disable + scope:"/" + additionalPrecacheEntries)
- [x] 2.3 `frontend/src/sw.ts` を新規作成し、precache manifest 取り込み + runtime caching ルールを定義する (→ Serwist class + NetworkOnly/CacheFirst/SWR routes)
- [x] 2.4 SW を `/sw.js` として配信する出力先を `next.config.ts` で設定する (→ swDest:"public/sw.js"。build script を `next build --webpack` に切替)
- [x] 2.5 `frontend/src/app/layout.tsx` に SW registration コンポーネントを追加（本番のみ register、`scope: "/"` 明示） (→ `<ServiceWorkerRegister />` client component)

## 3. ランタイムキャッシュ戦略の実装

- [x] 3.1 sw.ts に NetworkOnly を `/api/*` および Lambda Function URL ホスト宛てに適用する (→ `/^\/api\//` RegExpRoute + `NEXT_PUBLIC_API_BASE_URL` host RegExp)
- [x] 3.2 sw.ts に CacheFirst を `/_next/static/*`, `/icon-*.png`, `/favicon.ico`, `/manifest.webmanifest` に適用する (→ `staticAssetRoute` CacheFirst + Expiration plugin)
- [x] 3.3 sw.ts に StaleWhileRevalidate を `destination === "document"` に適用する (→ `documentRoute` Route + StaleWhileRevalidate)
- [x] 3.4 `skipWaiting` および `clients.claim` を SW lifecycle に組み込む (→ `Serwist` 構築時 `skipWaiting: true` + `clientsClaim: true`)

## 4. テスト実装（TDD: Red → Green → Refactor）

- [x] 4.1 実装 sub-agent (`superpowers:subagent-driven-development`) を起動し、`superpowers:test-driven-development` で以下の検証を回す (→ 実装 sub-agent で TDD 実施: unit test を RED → impl で GREEN)
- [x] 4.2 spec scenario 「本番で /sw.js が配信される」「開発モードでは /sw.js を返さない」を確認するビルド成果物検査テスト or E2E を追加 (→ `src/sw.config.test.ts` S-3 unit + `e2e/service-worker.spec.ts` S-1 e2e)
- [x] 4.3 spec scenario 「pre-cache 対象に shell HTML と静的アセットが含まれる」を `@serwist/next` の build 後 manifest 検査で確認するテストを追加 (→ `src/sw.precache.test.ts` S-4 unit, self-builds in beforeAll)
- [x] 4.4 SW 専用 E2E (`e2e/service-worker.spec.ts`) を新規作成し、`serviceWorkers: "allow"` で起動して install 後の CacheStorage を検査する (→ `sw` project: `serviceWorkers:"allow"` + port 3001 production build。S-1/S-2/S-5)
- [x] 4.5 SW 専用 E2E に「shell HTML の SWR 挙動」「API の NetworkOnly 挙動」のシナリオを追加 (→ S-6 API NetworkOnly + S-7 CacheFirst + S-8 SWR shell)
- [x] 4.6 SW 専用 E2E に「新バージョン配信時の skipWaiting / clients.claim」シナリオを追加 (→ S-9/S-10 を unit (`sw.config.test.ts`) でガード。実切替 E2E はコスト対効果から見送り＝proposal の判定と一致)

## 5. 既存 E2E への影響対策

- [x] 5.1 `frontend/playwright.config.ts` の `mock` / `preview` project に `use.serviceWorkers: "block"` を追加 (→ 加えて `sw` project を追加し SW spec をそちらに隔離)
- [ ] 5.2 既存 E2E スイートを `npm run test:e2e` で実行し、green を確認

## 6. ローカル検証

- [ ] 6.1 `npm run build && npx serve .next/standalone` 相当で本番ビルドをローカル起動し、Chrome DevTools Application で SW registration と CacheStorage 内容を目視確認
- [ ] 6.2 Network 条件を Slow 4G にして PWA install → 再起動 → skeleton 描画時間が <500ms になることを目視確認
- [ ] 6.3 オフラインで shell が表示されることを目視確認

## 7. CI と本番デプロイ

- [ ] 7.1 全コミットを push し `gh pr checks --watch` で CI 全 green を確認
- [ ] 7.2 コードレビュー sub-agent で変更差分をレビュー → ユーザーが最終確認
- [ ] 7.3 PR マージ前に `opsx:archive` で specs を同期しアーカイブする（同じブランチ）
- [ ] 7.4 main マージ → Vercel 自動デプロイの完了を確認

## 8. 本番計測と Issue クローズ

- [ ] 8.1 本番デプロイから 30 分以上待ち、SW が install + activate された状態で Issue #179 と同じ Playwright スクリプトで skeleton 描画時間を再計測する
- [ ] 8.2 iOS Safari でホーム画面 PWA を再起動し、白画面時間を実機で確認する
- [ ] 8.3 計測結果を Issue #180 / #179 にコメントし、改善幅を記録して #180 をクローズ
