## 1. Repository 層: DeleteGroup

- [x] 1.1 `backend/repository/group_pg.go` に `DeleteGroup(ctx, groupID uuid.UUID) error` を実装する。トランザクション内で `DELETE FROM stock_items WHERE group_id = $1` → `DELETE FROM groups WHERE id = $1` の順に実行する（design.md Decision 1）。`groups` の DELETE が0行だった場合（group が存在しない）は `ErrNotFound` を返す
- [x] 1.2 `backend/repository/group.go`（または repository interface を定義しているファイル）の `GroupRepository` interface に `DeleteGroup` を追加する
- [x] 1.3 `backend/repository/group_test.go` に `TestDeleteGroup` を追加する（`setupGroupTestDB` パターンを使用）:
  - `success_empty_group`: 商品0件の group を削除し、`groups`/`group_members`/`invitations` の該当行が消えることを直接クエリで確認（B-1 の Backend Integration 部分）
  - `success_with_stock_items`: `stock_items` へ直接 INSERT してから削除し、エラーにならず商品も消えることを確認（B-2、`group_id` は NOT NULL のため必須指定）
  - `not_found`: 存在しない group ID を渡すと `ErrNotFound` を返すことを確認（B-5 の Backend Integration 部分）

## 2. Handler 層: DELETE /api/groups/:id

- [x] 2.1 `backend/handler/group.go` に `DeleteGroup` ハンドラを追加する。認可は `UpdateGroup` と同じパターン（`groupID != authInfo.GroupID` → 403、`authInfo.Role != "owner"` → 403）。`repo.DeleteGroup` を呼び、`ErrNotFound` は 404、その他エラーは 500、成功時は 200（レスポンスボディはなしで可、`UpdateGroup` 等の既存レスポンス形式と整合を取る）
- [x] 2.2 `backend/main.go` に `e.DELETE("/api/groups/:id", groupHandler.DeleteGroup, jwtGroupMW)` を登録する（`PATCH /api/groups/:id` と同じミドルウェア）
- [x] 2.3 `backend/handler/group_test.go` に `TestDeleteGroup` を追加する（`TestUpdateGroup` の3パターンを模す、mock repo 使用）:
  - `owner_success`: 200 を返し `mock.DeleteGroup` が呼ばれる
  - `member_forbidden`: 403、`DeleteGroup` は呼ばれない
  - `wrong_group_forbidden`: 403、`DeleteGroup` は呼ばれない
  - `not_found`: mock が `ErrNotFound` を返すとき 404 を返す（B-5 の Backend Unit 部分）
- [x] 2.4 `backend/handler/group_test.go` のテスト用 mock repo（`mockGroupRepo` 等）に `deleteGroupFn` フィールドを追加する

## 3. E2E teardown

- [x] 3.1 `frontend/e2e/global-teardown.ts` で、stock_items 削除ループの後・`.auth` ディレクトリ削除の前に、動的作成した group（`.auth/group.json` の `ephemeral` フィールドが `true` の場合のみ、`E2E_TEST_GROUP_ID` 固定指定時は `ephemeral: false` が書き込まれるため対象外）に対して `DELETE /api/groups/${testGroupId}` を1回呼ぶ（design.md Decision 3）。呼び出し失敗時も `console.warn` するのみでテストを失敗させない(既存の他の失敗パスと同じスタイル)

## 4. 動作確認

- [x] 4.1 `cd backend && go test ./...` が green になることを確認する
- [x] 4.2 `cd backend && golangci-lint run` が clean であることを確認する
- [x] 4.3 CI の `e2e`（mock project）が green になったことで代替確認（teardown がエラーなく完了している）。本PRはUI変更を含まないためローカル実行は省略
- [x] 4.4 CI（`ci.yml` の backend job、`e2e.yml`、`e2e-preview.yml`）が green になることを確認する(e2e-preview は Issue #247 の既知の間欠的問題により複数回 rerun が必要だったが、最終的に green)
- [x] 4.5 (手動、一度だけ) 実際の CI run（33878959662）が作成した ephemeral group（`cea94a8c-...`）が teardown 完了後に DB から消えていることを直接クエリで確認した。あわせて Preview backend の `DELETE /api/groups/:id` を手動 curl でも直接検証(200 OK)。今回の調査開始時点で溜まっていた本PR以前のバックログ(45件、主に別Issueの調査由来)はユーザー承認のもと一度だけクリーンアップ済み
