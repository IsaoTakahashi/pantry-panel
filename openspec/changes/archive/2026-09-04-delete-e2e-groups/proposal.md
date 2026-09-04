## Why

`DELETE /api/groups/:id` は未実装で、group を削除する手段がバックエンドに存在しない。このため E2E テスト（`frontend/e2e/global-setup.ts`）が CI 実行のたびに作成する使い捨て group が一度も片付けられず無制限に蓄積し続けている（Issue #251。調査の過程で、E2E テストユーザーの `group_members` が2026-05-23の初回CI実行から今日までの間に263件まで蓄積していたことが判明した）。実害は現状小さいが、DB 肥大化につながる未対処のリソースリークであり、実装コスト自体も小さい。

## What Changes

- backend: `DELETE /api/groups/:id` エンドポイントを追加する。呼び出し元は group の owner のみ（既存の `PATCH /api/groups/:id` と同じ認可パターン）。group に紐づく `stock_items` / `group_members` / `invitations` をトランザクション内でまとめて削除する（`group_members` / `invitations` は既存の `ON DELETE CASCADE` で自動的に削除されるが、`stock_items.group_id` は `ON DELETE CASCADE` が付いていないため、明示的に先に削除する必要がある）
- frontend E2E: `global-teardown.ts` が動的作成した group 自体を削除するようにする（既存のコメントに記載済みの意図を実装する）

## Capabilities

### New Capabilities
- `group-management`: group の削除（DELETE）に関する API 契約。作成・更新・招待は既存実装のまま（新規スペック化はせず、削除のみを対象とする）

### Modified Capabilities
（なし）

## Impact

- `backend/handler/group.go`, `backend/repository/group_pg.go`, `backend/main.go`（ルート登録）
- `backend/repository/group_pg_test.go` 等、対応するテスト
- `frontend/e2e/global-teardown.ts`
- 影響範囲は限定的。既存の group 作成・更新・招待フローには影響しない

## ユーザーシナリオとテスト設計

本 change はフロントエンドの新規ユーザー操作を伴わない（`frontend/e2e/global-teardown.ts` の変更は E2E テストインフラの後片付け処理であり、プロダクト機能ではない）。したがって **フロントエンドシナリオのセクションは設けない**。判断ツリー（`testing.md`）上も Q1（ブラウザを起動しないと検証できない？）が No のため、全シナリオを Backend Unit / Integration で検証する。

### バックエンドシナリオ

#### サマリ
| # | シナリオ | スコープ |
|---|---------|---------|
| B-1 | owner が商品未登録の group を削除する | Backend Unit / Backend Integration |
| B-2 | 商品が登録された group を owner が削除する（stock_items 削除順序の検証） | Backend Integration |
| B-3 | member ロールのユーザーが削除しようとする | Backend Unit |
| B-4 | `X-Active-Group-ID` と URL の `:id` が一致しない group を指定する | Backend Unit |
| B-5 | 削除対象の group が repo 層で見つからない（`ErrNotFound` → 404） | Backend Unit / Backend Integration |

---

#### B-1: owner が商品未登録の group を削除する
**Given:** owner ロールのユーザーが所属する group が存在し、`stock_items` は0件
**When:** owner が `DELETE /api/groups/:id`（`:id` は自分のアクティブグループ）を呼ぶ
**Then:** 200 を返し、`groups` / `group_members` / `invitations` の該当行がすべて削除される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | `authInfo.GroupID == :id` かつ `Role == "owner"` のとき `repo.DeleteGroup` が呼ばれ 200 を返す | `handler/group_test.go` の `TestUpdateGroup/owner_success` と同じパターン（mock repo） |
| Backend Integration | 削除後、`groups` に該当行が無い。同時に作成した `group_members`（owner分）・`invitations`（事前に1件発行）も消えていることを直接クエリで確認する | `repository/group_test.go` の `setupGroupTestDB` パターンを踏襲。cascade 任せの部分（`group_members`/`invitations`）が実際に機能していることの確認を兼ねる |

**E2E判定:** No
**理由:** ブラウザ操作を伴わない API 契約の検証であり、判断ツリー Q1 = No。DB の実際の cascade 挙動は Backend Integration（testcontainers）で直接クエリすれば十分再現できる

---

#### B-2: 商品が登録された group を owner が削除する（stock_items 削除順序の検証）
**Given:** owner が所属する group に `stock_items` が1件以上登録されている
**When:** owner が `DELETE /api/groups/:id` を呼ぶ
**Then:** 200 を返し、外部キー制約違反エラーにならずに group と紐づく `stock_items` がすべて削除される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Integration | ①エラーなく 200 が返る（`stock_items.group_id` に `ON DELETE CASCADE` が無いため、実装が Decision 1 のとおり `stock_items` を先に削除していないと FK 違反で失敗する — この意味で本シナリオ自体が delete 順序の discriminator になる）②削除後に `stock_items` テーブルへ直接クエリし、対象 group の商品が0件であることを確認する（`groups` 行が消えているだけでは stock_items 残留を見逃すため、この行を必須とする） | `PgGroupRepository` に商品作成用メソッドが無いため、テスト側で `stock_items` へ直接 `INSERT`（`group_id` は `008` マイグレーションで `NOT NULL` 化済みのため必須項目）してセットアップする |

**E2E判定:** No
**理由:** FK 制約違反の有無は実 Postgres でのトランザクション実行結果でしか確認できないため Backend Integration（testcontainers）が正しいスコープ。ブラウザは不要（判断ツリー Q1 = No）

---

#### B-3: member ロールのユーザーが削除しようとする
**Given:** `role = member` のユーザーが group に所属している
**When:** そのユーザーが `DELETE /api/groups/:id` を呼ぶ
**Then:** 403 を返し、group は削除されない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | `authInfo.Role != "owner"` のとき `repo.DeleteGroup` が呼ばれずに 403 を返す | `handler/group_test.go` の `TestUpdateGroup/member_forbidden` と同じパターン（mock repo、`DeleteGroup` 未設定でも panic しないことで未呼び出しを保証） |

**E2E判定:** No
**理由:** authz 分岐のみの検証で DB アクセスも発生しないため、既存の `UpdateGroup` 同様 Backend Unit のみで十分（Backend Integration を重ねる追加価値がない）

---

#### B-4: `X-Active-Group-ID` と URL の `:id` が一致しない group を指定する
**Given:** owner ロールのユーザーが group A に所属し、`X-Active-Group-ID: A` でリクエストする
**When:** URL パスに group A とは異なる group B の ID を指定して `DELETE /api/groups/:id` を呼ぶ
**Then:** 403 を返し、group B は削除されない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | `groupID(path) != authInfo.GroupID` のとき `repo.DeleteGroup` が呼ばれずに 403 を返す | `handler/group_test.go` の `TestUpdateGroup/wrong_group_forbidden` と同じパターン |

**E2E判定:** No
**理由:** authz 分岐のみで DB アクセスなし。なお「そもそも group B に所属していない（メンバーシップが無い）」ケースは `middleware/auth.go` が `X-Active-Group-ID` を検証してメンバーシップと突き合わせる層の責務であり、本ハンドラのテスト対象外（spec の文言どおり「`X-Active-Group-ID` と `:id` の不一致」をテストする）

---

#### B-5: 削除対象の group が repo 層で見つからない（`ErrNotFound` → 404）
**Given:** `repo.DeleteGroup` が `repository.ErrNotFound` を返す状態
**When:** owner が `DELETE /api/groups/:id` を呼ぶ
**Then:** 404 を返す

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | `repo.DeleteGroup` が `ErrNotFound` を返すとき、ハンドラが `errors.Is` で判定して 404 にマッピングする（`AcceptInvitation` の `expired`→410 マッピングテストと同じ形） | **注意**: このテストは mock repo に直接 `ErrNotFound` を返させて `AuthInfo{GroupID: :id, Role: "owner"}` を注入している。本番でこの分岐に実際に到達するのは、group が「認可チェック時点（`middleware/auth.go` のメンバーシップ解決）では存在したが、`repo.DeleteGroup` 実行時点までに別リクエストで既に削除済み」という**競合状態**のときのみ（後述のOpen Question参照） |
| Backend Integration | `repo.DeleteGroup(存在しないID)` を直接呼び、`ErrNotFound` が返ることを確認する | `repository/group_test.go` の `TestUpdateGroupName/not_found` と同じパターン。ハンドラの認可層を経由しない、repo 単体の契約確認 |

**E2E判定:** No
**理由:** DB に存在しないレコードへの操作結果の確認であり、ブラウザ操作は不要

---

### `frontend/e2e/global-teardown.ts` の追加呼び出しについて（テスト非対象の判断）

`global-teardown.ts` に追加する `DELETE /api/groups/${testGroupId}` 呼び出し自体には、専用の自動テストを設けない。

**理由:**
- これはプロダクトコードではなく E2E テストインフラの後片付け処理であり、バグの影響範囲は「CI 上の group_members 蓄積が再発する」程度に限定され、ユーザーの JTBD には影響しない
- Decision 3（design.md）で teardown の失敗はテスト結果を失敗させない設計を意図的に採用している。この呼び出し専用の pass/fail アサーションを追加すると、その設計意図と矛盾する（teardown の信頼性とテスト結果の切り離しを自ら破ることになる）
- 唯一の新規ロジック（ephemeral フラグ＝動的作成 group のときのみ削除し、`E2E_TEST_GROUP_ID` 固定指定時は削除しない条件分岐）は、`global-setup.ts` が書き出す `.auth/group.json` の有無を見るだけの単純な条件分岐であり、`DELETE /api/groups/:id` 自体は B-1〜B-5 で契約が保証済みのため、テストの限界費用に見合う複雑さがない

**代替として:** 実装完了後、CI で一度 E2E フルスイートを実行し、実行前後で Supabase 上の `group_members` / `groups` 件数が増加していないことを一度だけ手動確認する（tasks.md に確認タスクとして追加する）。継続的な自動テストとしては設けない。
