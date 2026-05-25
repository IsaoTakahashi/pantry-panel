## 1. 事前調査（実装前に確認）

- [ ] 1.1 `frontend/src/app/stock-items/` の page コンポーネントと page.test.tsx を読み、CreateItemModal への props 渡し方・FilterBar とのインタラクション・ログアウトボタンの実装を確認する
- [ ] 1.2 `frontend/src/components/ItemCard.tsx` を読み、wantToBuy=true 時のカートアイコンの CSS クラス・sourceUrl がある場合の外部リンクアイコンの実装を確認する
- [ ] 1.3 `frontend/src/components/UrlRegistrationModal.tsx` を読み、SSE 完了後の進捗リスト非表示・結果表示への切り替えロジックを確認する
- [ ] 1.4 `frontend/src/components/ImageSelectionModal.tsx` を読み、API エラー（503）時のエラー表示ロジックを確認する
- [ ] 1.5 `backend/repository/stock_item_test.go` と `backend/repository/stock_item.go` を読み、testcontainers のセットアップ（setupTestDB）と既存 Integration テストのパターンを確認する
- [ ] 1.6 backend の Migration ファイル（`backend/db/migrations/`）を確認し、RLS ポリシーが testcontainers でも適用されるかどうかを確認する

## 2. フロントエンドテスト: page.test.tsx への追加

- [ ] 2.1 B-4: 検索テキスト入力済み状態で「商品を追加」を押すと CreateItemModal に `initialName` がセットされることを検証するテストを `page.test.tsx` に追加する（`// Scenario: B-4` コメント付き）
- [ ] 2.2 B-5: カテゴリフィルタ選択済み状態で「商品を追加」を押すと CreateItemModal に `initialCategory` がセットされることを検証するテストを追加する（`// Scenario: B-5` コメント付き）
- [ ] 2.3 B-6: 買い物リストフィルタ ON 状態で商品作成時に `createStockItem` へ `wantToBuy: true` が渡されることを検証するテストを追加する（`// Scenario: B-6` コメント付き）
- [ ] 2.4 D-3: 商品名を編集して保存したとき `updateStockItem` の引数に `sortedAt` が含まれないことを検証するテストを追加する（`// Scenario: D-3` コメント付き）
- [ ] 2.5 E-2: wantToBuy=true の商品を OFF にしたとき `updateStockItem` の引数に `sortedAt` が含まれないことを検証するテストを追加する（`// Scenario: E-2` コメント付き）
- [ ] 2.6 K-4: ログアウトボタンをクリックすると `signOut` が呼ばれることを検証するテストを追加する（`// Scenario: K-4` コメント付き）

## 3. フロントエンドテスト: ItemCard.test.tsx への追加

- [ ] 3.1 E-3: wantToBuy=true のとき カートアイコン要素に強調スタイル（CSS クラスまたは aria-pressed）が付くことを検証するテストを追加する（`// Scenario: E-3` コメント付き）
- [ ] 3.2 J-1-4 (非 null): sourceUrl が非 null のとき外部リンクアイコンが表示されることを検証するテストを追加する（`// Scenario: J-1-4` コメント付き）
- [ ] 3.3 J-1-4 (null): sourceUrl が null のとき外部リンクアイコンが表示されないことを検証するテストを追加する

## 4. フロントエンドテスト: UrlRegistrationModal.test.tsx への追加

- [ ] 4.1 J-3-3: SSE ストリームが完了イベントと抽出結果（name / imageUrl）を返した後、進捗リストが消えて抽出結果が表示されることを検証するテストを追加する（`// Scenario: J-3-3` コメント付き）

## 5. フロントエンドテスト: ImageSelectionModal.test.tsx への追加

- [ ] 5.1 I-6: `fetchImageSearchResults` モックが 503 エラー相当のレスポンスを返したとき、エラーメッセージが表示されることを検証するテストを追加する（`// Scenario: I-6` コメント付き）

## 6. バックエンドテスト: stock_item_test.go への追加

- [ ] 6.1 L-6 (取得): ユーザー B（group_id=B）として stock_items を取得したとき、ユーザー A（group_id=A）の stock_item が返ってこないことを Integration テストで検証する（`// Scenario: L-6` コメント付き）
- [ ] 6.2 L-6 (更新): ユーザー B として ユーザー A の stock_item を更新しようとしたとき、更新が反映されないことを Integration テストで検証する

## 7. CI 確認

- [ ] 7.1 ローカルで `cd frontend && pnpm test run` を実行してすべてのテストが通ることを確認する
- [ ] 7.2 ローカルで `cd backend && go test ./...` を実行してすべてのテストが通ることを確認する
- [ ] 7.3 変更を push して `gh pr checks --watch` で CI が green になることを確認する
