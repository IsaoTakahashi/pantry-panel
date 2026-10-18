## 1. 変更前の計測（実装前に実施）

- [ ] 1.1 本番に対して Playwright でユーザー本人のログイン状態（storageState、`measurement/` に保存しコミットしない）を再現し、`/stock-items` へ移動してから最大のグループ（82 件）の在庫が全件表示されるまでの時間を測る計測スクリプトを用意する。スクリプトを 1 回流して数値が出ることで確認する
- [ ] 1.2 middleware が冷えた状態（15 分以上あけた直後）と温まった状態のそれぞれで複数回計測し、中央値を Issue #306 にコメントで記録する。コメントが投稿されていることで確認する

## 2. エラー型

- [ ] 2.1 `frontend/src/lib/api.ts` に `status` を持つ `Error` のサブクラスを追加し、`fetchStockItems` が `!response.ok` でそれを投げるようにする（メッセージは `HTTP <status>` のまま）。401 で `instanceof` と `status` が判定できること、メッセージが変わらないことをユニットテストで確認する

## 3. cookie を消して /login へ送るルート

- [ ] 3.1 `sb-*-auth-token` 系 cookie（チャンク分割を含む）を失効させて `/login` へリダイレクトする Route Handler を追加する。リダイレクト先は `/login` 固定で、クエリによる行き先指定を受け付けない。ユニットテストで、失効した Set-Cookie と `/login` への 307/303 リダイレクトを確認する
- [ ] 3.2 このルートを middleware の `EXCLUDED_PATHS` に加え、セッション判定を通さないことをユニットテストで確認する

## 4. middleware（/stock-items）

- [ ] 4.1 `/stock-items` では `getClaims()` の代わりに `getSession()` を使う。期限内なら Supabase と通信せずに通過し `x-pp-authenticated: 1` を付けること、期限切れなら更新して新しい cookie を返すことをユニットテストで確認する
- [ ] 4.2 `getSession()` のエラー分類（retryable / refresh discarded は fail open、それ以外のエラーは cookie を消して `/login`、セッションなしは `/login`）を実装し、それぞれをユニットテストで確認する
- [ ] 4.3 在庫の先読み（`fetchStockItems` の並列発射）、`x-pp-initial-items` の付与・削除、関連するシリアライズ処理を削除する。`/stock-items` へのリクエストで middleware が Go API を呼ばないことをユニットテストで確認する
- [ ] 4.4 `/stock-items` 以外の保護ルート（`/`・`/invite`・`/no-group`）は今の `getClaims()` の挙動のままであることを、既存のユニットテストがすべて通ることで確認する

## 5. page（getInitialStockItems）

- [ ] 5.1 `x-pp-initial-items` の読み取りを削除し、cookie のトークンで Go API を 1 回だけ呼ぶ形にする。成功時に在庫が返り、Go API の呼び出しが 1 回であることをユニットテストで確認する
- [ ] 5.2 401 を受けたとき、cookie のアクセストークンの `exp` が期限内なら 3.1 のルートへ `redirect()` し、期限切れなら `null` を返す。両方の分岐をユニットテストで確認する
- [ ] 5.3 401 以外の失敗（403・5xx・タイムアウト）は今と同じく `null` を返すことをユニットテストで確認する。各分岐で区別できる構造化ログが出ることも確認する

## 6. 回帰確認

- [ ] 6.1 `e2e/ssr-stock-items.spec.ts`（JS 無効でも初期 HTML に在庫が描画される）を含め、`cd frontend && npx playwright test` がローカルで通ることを確認する
- [ ] 6.2 フロントエンドの Biome・tsc・Vitest がすべて通り、PR の CI が通ることを `gh pr checks` で確認する

## 7. 変更後の確認（マージ後）

- [ ] 7.1 本番の Vercel ランタイムログで、`/stock-items` の 1 アクセスあたりの Go API 呼び出しが 1 回であること、middleware からの JWKS 取得がないことを確認する
- [ ] 7.2 1.1 と同じ方法・条件で変更後を計測し、変更前と比較して Issue #306 に記録する。同じ条件での中央値が 20% 以上悪化していたら、巻き戻す前にユーザーに相談する
