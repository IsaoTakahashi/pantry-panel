## 1. テスト設計

- [ ] 1.1 テスト設計 sub-agent が proposal.md に「ユーザーシナリオとテスト設計」セクションを作成する（`.claude/rules/testing.md` のフォーマット）→ ユーザーレビュー

## 2. SW pre-cache の見直し（決定2）

- [ ] 2.1 `sw.precache.test.ts` を更新: `/stock-items` が pre-cache に含まれないこと、`_next/static/*`・icons・manifest は含まれることを検証（Red）
- [ ] 2.2 `frontend/next.config.ts` の `additionalPrecacheEntries` から `/stock-items` を除外（Green）
- [ ] 2.3 リファクタ＆コメント整理（`additionalPrecacheEntries` の意図コメントを更新）

## 3. document ランタイム戦略 NetworkFirst 化（決定1）

- [ ] 3.1 `sw.config.test.ts` を更新: document destination の handler が NetworkFirst であることを検証（Red）
- [ ] 3.2 `frontend/src/sw.ts` の document destination handler を StaleWhileRevalidate → NetworkFirst に変更（Green）
- [ ] 3.3 API NetworkOnly / 静的 CacheFirst が不変であることを確認・リファクタ

## 4. ChunkLoadError 自己回復（決定3）

- [ ] 4.1 回復ユーティリティの unit テストを作成: ChunkLoadError 判定、`sessionStorage` ガードで1回制限、`caches` 削除・SW unregister・`reload` 呼び出しを検証（Red）
- [ ] 4.2 回復ユーティリティを実装（`window` の error / unhandledrejection を購読、本番のみ作動）（Green）
- [ ] 4.3 `layout.tsx` から回復ロジックをマウント（専用コンポーネント or `ServiceWorkerRegister` 統合、テスト容易性優先）
- [ ] 4.4 リファクタ

## 5. 検証

- [ ] 5.1 `cd frontend && npm run lint && npx tsc --noEmit && npx vitest run` が緑
- [ ] 5.2 UI 変更を含むため `cd frontend && npx playwright test`（dev server 起動状態）で pass 確認
- [ ] 5.3 コードレビュー sub-agent が差分をレビュー → ユーザー最終確認
- [ ] 5.4 commit のたびに push し `gh pr checks --watch` で PR 上の CI 緑を確認
