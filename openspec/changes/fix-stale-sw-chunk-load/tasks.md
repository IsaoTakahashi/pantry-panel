## 1. テスト設計

- [x] 1.1 テスト設計 sub-agent が proposal.md に「ユーザーシナリオとテスト設計」セクションを作成する（`.claude/rules/testing.md` のフォーマット）→ ユーザーレビュー

## 2. SW pre-cache の見直し（決定2）

- [x] 2.1 `sw.precache.test.ts` を更新: `/stock-items` が pre-cache に含まれないこと、`_next/static/*`・icons・manifest は含まれることを検証（Red）
- [x] 2.2 `frontend/next.config.ts` の `additionalPrecacheEntries` から `/stock-items` を除外（Green）
- [x] 2.3 リファクタ＆コメント整理（`additionalPrecacheEntries` の意図コメントを更新）
- [x] 2.4 ドリフトガード（start_url ∈ additionalPrecacheEntries）を反転（C-3。start_url は `/stock-items` 維持）

## 3. document ランタイム戦略 NetworkFirst 化（決定1）

- [x] 3.1 `sw.config.test.ts` を更新: document destination の handler が NetworkFirst であることを検証（Red）
- [x] 3.2 `frontend/src/sw.ts` の document destination handler を StaleWhileRevalidate → NetworkFirst に変更（Green）
- [x] 3.3 API NetworkOnly / 静的 CacheFirst が不変であることを確認・リファクタ
- [x] 3.4 既存 E2E `service-worker.spec.ts` S-8 を NetworkFirst 仕様に更新

## 4. ChunkLoadError 自己回復（決定3）

- [x] 4.1 回復ユーティリティの unit テストを作成: ChunkLoadError 判定、`sessionStorage` ガードで1回制限、`caches` 削除・SW unregister・`reload` 呼び出しを検証（Red）
- [x] 4.2 回復ユーティリティを実装（`window` の error / unhandledrejection を購読、本番のみ作動）（Green）
- [x] 4.3 `layout.tsx` から回復ロジックをマウント（専用コンポーネント `ChunkLoadRecovery`）
- [x] 4.4 リファクタ

## 5. 検証

- [x] 5.1 `cd frontend && npm run lint && npx tsc --noEmit && npx vitest run` が緑（289/289 pass, tsc clean, biome clean）
- [x] 5.2 SW 変更のため `npm run test:e2e:sw`（sw project, 本番ビルド）で pass 確認（6/6 pass, S-8 含む）
- [x] 5.3 コードレビュー sub-agent が差分をレビュー（spec + quality 各タスク + 統合レビュー: Ready）→ ユーザー最終確認
- [ ] 5.4 commit のたびに push し `gh pr checks --watch` で PR 上の CI 緑を確認
