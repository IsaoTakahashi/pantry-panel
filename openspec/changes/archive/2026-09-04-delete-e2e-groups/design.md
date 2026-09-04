## Context

`groups` テーブルは `group_members`（`ON DELETE CASCADE`）と `invitations`（`ON DELETE CASCADE`）から参照されているが、`stock_items.group_id`（`006_add_group_id_to_stock_items.sql`）は `ON DELETE CASCADE` が付いていない単純な `REFERENCES groups(id)`（`008` で `NOT NULL` 化）。そのため、`stock_items` が1件でも残っている group を単純に `DELETE FROM groups WHERE id = $1` すると FK 違反で失敗する。

`backend/handler/group.go` の既存エンドポイント（`CreateGroup`, `UpdateGroup`, `CreateInvitation`, `AcceptInvitation`）は `middleware.GetAuthInfo(c)` から `AuthInfo{UserID, GroupID, Role}` を取得し、`PATCH /api/groups/:id`（`UpdateGroup`）は `groupID == authInfo.GroupID && authInfo.Role == "owner"` を認可条件にしている。この既存パターンをそのまま踏襲する。

## Goals / Non-Goals

**Goals:**
- owner が自分の所属 group を削除できる `DELETE /api/groups/:id` を追加する
- 削除時に group 配下の `stock_items` / `group_members` / `invitations` が残留しないようにする
- `frontend/e2e/global-teardown.ts` がこのエンドポイントを使って動的作成した group を実際に片付けるようにする

**Non-Goals:**
- group の「アーカイブ」「復元」など、削除以外のライフサイクル管理は範囲外
- 複数 owner や owner 以外のメンバーへの削除権限委譲は範囲外（既存の `role` モデルをそのまま使う）
- 本番ユーザーの group 削除 UI（フロントエンドの設定画面等）の追加は範囲外。今回はバックエンド API と E2E teardown のみ

## Decisions

### Decision 1: `stock_items` はトランザクション内で明示的に先に削除する

`DELETE FROM stock_items WHERE group_id = $1` を実行してから `DELETE FROM groups WHERE id = $1` を同一トランザクションで実行する。`group_members`/`invitations` は既存の `ON DELETE CASCADE` に任せる。

**代替案として検討したが採用しなかったもの:**
- `stock_items.group_id` に `ON DELETE CASCADE` を追加するマイグレーション → DB スキーマ変更を伴い、既存の「group 削除時に商品も自動で消える」という暗黙の外部キー任せの挙動になる。今回はハンドラ層で明示的に制御する方が意図が読み取りやすく、マイグレーション追加のリスクも避けられるため見送る
- 商品が残っている場合は 409 等でエラーにして呼び出し元に事前の削除を要求する → E2E teardown 側で毎回2段階の呼び出し（stock_items 削除→group 削除）が必要になり複雑化する。API 利用者（将来の本番 UI 含む）にとっても「group を消す」という操作が1回のリクエストで完結する方が直感的なため、トランザクション内での cascade 削除を採用する

### Decision 2: 認可は既存の `UpdateGroup` と同一パターン

`groupID != authInfo.GroupID` → 403、`authInfo.Role != "owner"` → 403。新しいミドルウェアや権限モデルは導入しない。

### Decision 3: `global-teardown.ts` の呼び出しタイミング

既存の stock_items 削除ループの後、`.auth` ディレクトリ削除の前に `DELETE /api/groups/${testGroupId}` を1回呼ぶ。既存コードのコメント（「ephemeral フラグは将来 DELETE /api/groups/:id が実装されたとき、動的作成 group のみ削除するために setup 側で永続化している」）が示す想定通り、`global-setup.ts` が動的作成した group のみを対象とする（`E2E_TEST_GROUP_ID` 環境変数で固定 ID を指定したローカル開発時は削除しない — 固定 group を毎回消すと再実行のたびに `npm run setup:e2e` が必要になり開発体験を損なうため）。

## Risks / Trade-offs

- [Risk] `stock_items` の削除を group 削除に同梱すると、意図せず group を削除した場合に商品データも道連れで失われる → owner のみ実行可能（Decision 2）というアクセス制御で誤操作のリスクは限定的。本番 UI からの呼び出しを将来追加する場合は、フロントエンド側で確認ダイアログ（`ConfirmDialog`）を挟むことを設計時の前提とする
- [Risk] `DELETE FROM stock_items WHERE group_id = $1` は対象商品数が多い場合にロック時間が伸びる可能性がある → 現状の利用規模（家庭用、1 group あたり数十件程度）では実用上問題にならないと判断。将来的に問題になった場合はバッチ削除を検討する
- [Trade-off] E2E teardown が `DELETE /api/groups/:id` 呼び出しに失敗しても（既存の `global-teardown.ts` の他の失敗パスと同様）テスト自体は失敗させない設計とする。E2E インフラの片付け失敗でテスト結果が不安定になることを避けるため

## Migration Plan

- DB スキーマ変更なし（Decision 1 で見送り）。既存の `ON DELETE CASCADE` 設定をそのまま利用する
- ロールバック: 通常の revert で良い（新規エンドポイント追加のみ、既存挙動への変更なし）

## Open Questions

（なし）
