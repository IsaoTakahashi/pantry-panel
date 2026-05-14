## 1. DB migration（Supabase）

- [x] 1.1 `backend/db/migrations/002_enable_realtime_stock_items.sql` を作成。`ALTER PUBLICATION supabase_realtime ADD TABLE stock_items;` を記述
- [x] 1.2 `backend/db/migrations/003_stock_items_rls.sql` を作成。RLS を有効化し anon に SELECT のみ許可するポリシーを定義
- [x] 1.3 Supabase Dashboard の SQL Editor で `002` を適用し、Database → Replication で `stock_items` が含まれることを確認
- [x] 1.4 Supabase Dashboard の SQL Editor で `003` を適用し、`SELECT * FROM pg_policies WHERE tablename='stock_items'` でポリシーを確認
- [x] 1.5 Supabase Dashboard の Table Editor で anon ロールから INSERT が拒否されることを確認（手動）
- [x] 1.6 Lambda 経由の CRUD が引き続き動作することを `https://pantry-panel-xi.vercel.app` で手動確認

## 2. Frontend dependencies と env

- [x] 2.1 `frontend/package.json` に `@supabase/supabase-js` の最新安定版を追加（`npm install`、Web 検索でバージョン確認）
- [x] 2.2 `frontend/.env.local.example` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を追記（コメントで取得元を明記）
- [x] 2.3 ローカル `.env.local` に開発用 Supabase の値を設定（git 管理外）

## 3. Supabase client と hook（Test → Implementation）

- [ ] 3.1 `frontend/src/lib/supabaseClient.ts` のテスト方針を Claude が提示（env 未設定時の挙動など、何をテストするか）
- [x] 3.2 ユーザーが `frontend/src/lib/supabaseClient.test.ts` を実装、Claude がレビュー
- [x] 3.3 ユーザーが `frontend/src/lib/supabaseClient.ts` を実装（env を読んで `createClient` でシングルトン export、未設定時は null を返して warn）、Claude がレビュー
- [x] 3.4 `frontend/src/lib/useStockItemsRealtime.ts` のテスト方針を Claude が提示（subscribe / unsubscribe / onChange 呼出 / env 未設定スキップ / 再接続時の onChange）
- [x] 3.5 ユーザーが `frontend/src/lib/useStockItemsRealtime.test.tsx` を実装、Claude がレビュー
  - Supabase client を mock し、`channel(...).on(...).subscribe(callback)` の lifecycle を検証
  - `onChange` が INSERT / UPDATE / DELETE のいずれでも 1 度呼ばれること
  - 再接続時（`SUBSCRIBED` event を再発火）に `onChange` が呼ばれること
  - env 未設定時に subscribe しないこと
- [x] 3.6 ユーザーが `frontend/src/lib/useStockItemsRealtime.ts` を実装、Claude がレビュー

## 4. Page 統合

- [x] 4.1 `frontend/src/app/stock-items/page.test.tsx` に Realtime 経由の再取得テストを追加（hook を mock し、`onChange` を呼ぶと `fetchStockItems` mock が再度呼ばれることを検証）。テスト方針は Claude が提示、ユーザーが実装、Claude がレビュー
- [x] 4.2 `frontend/src/app/stock-items/page.tsx` で `useStockItemsRealtime(() => fetchStockItems().then(setItems))` を呼び込む。`loading` を二度目以降に true に戻さないこと、エラー時に既存表示を壊さないことを満たす実装。ユーザーが実装、Claude がレビュー

## 5. E2E テスト

- [x] 5.1 `frontend/e2e/realtime-sync.spec.ts` のテスト方針と structure を Claude が提示
- [x] 5.2 ユーザーが `frontend/e2e/realtime-sync.spec.ts` を実装、Claude がレビュー
  - 2 つの BrowserContext を起動
  - Context A で create → Context B でカード表示を `waitFor`
  - Context A で wantToBuy トグル → Context B で `aria-pressed` 変化を `waitFor`
  - Context A で delete → Context B でカード消失を `waitFor`
  - `PLAYWRIGHT_SUPABASE_URL` / `_ANON_KEY` が未設定なら `test.skip` で全ケースをスキップ
- [x] 5.3 ローカルで `npm run test:e2e` を実行し、新 spec が pass することを確認

## 6. CI / デプロイ設定

- [x] 6.1 `.github/workflows/e2e.yml` を確認し、Realtime E2E が走るよう必要なら env を投入する分岐を追加（GitHub Secrets `SUPABASE_URL_E2E`, `SUPABASE_ANON_KEY_E2E` を読む）
- [x] 6.2 GitHub repository Secrets に `SUPABASE_URL_E2E` と `SUPABASE_ANON_KEY_E2E` を登録
- [x] 6.3 Vercel Dashboard で `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Production / Preview / Development の全環境に追加

## 7. 動作確認 & ドキュメント

- [ ] 7.1 ローカル frontend + 本番 Supabase で、別ブラウザ 2 タブを開いて Realtime 反映を手動確認
- [ ] 7.2 main マージ後に Vercel 本番（https://pantry-panel-xi.vercel.app）を 2 端末で開いて Realtime 反映を手動確認
- [x] 7.3 `.claude/rules/frontend.md` の「API 連携」「テスト」セクションを Supabase Realtime 採用後の状態に更新
- [x] 7.4 `.claude/rules/backend.md` の Phase 3.5 関連記述を最新化（RLS / publication migration の運用ルール追記）
- [x] 7.5 `specs/features.md` の Phase 3.5 セクションのステータスを「✅ 完了」に更新
- [ ] 7.6 Issue / PR をクローズ

## 8. 検証チェックリスト（spec 受入）

- [ ] 8.1 ページマウントで Realtime subscribe され、アンマウントで removeChannel される（DevTools Network の WS フレームで確認）
- [ ] 8.2 INSERT / UPDATE / DELETE のいずれでも他端末に反映される
- [ ] 8.3 env 未設定でローカル起動しても REST CRUD は壊れず、コンソールに warn が 1 度出る
- [ ] 8.4 anon key で直接 `stock_items` を INSERT すると permission denied になる（curl / Supabase JS の playground で確認）
- [ ] 8.5 Lambda 経由の書込みが引き続き成功し、Realtime に伝播する
- [ ] 8.6 ネットワーク切断 → 復帰時に再接続して、その間の変更が反映される（DevTools の Offline toggle で確認）
