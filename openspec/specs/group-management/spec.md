# group-management Specification

## Purpose
group（家族/世帯単位のグループ）のライフサイクル管理のうち、削除に関する API 契約を定義する。作成・更新・招待は本仕様の対象外（既存実装のまま、未文書化）。

## Requirements

### Requirement: owner は自分の所属 group を削除できる

`DELETE /api/groups/:id` は、リクエストの `X-Active-Group-ID` が指す group の `role = owner` であるユーザーからの呼び出しに限り、group とその配下データを削除する SHALL。owner 以外、または対象 group に所属していないユーザーからの呼び出しは 403 を返す MUST。

#### Scenario: owner が group を削除する
- **WHEN** group の owner が `DELETE /api/groups/:id`（`:id` は自分がアクティブグループとして指定している group の ID）を呼ぶ
- **THEN** 200 を返し、その group 自体、および配下の `stock_items` / `group_members` / `invitations` がすべて削除される

#### Scenario: owner 以外が削除しようとする
- **WHEN** `role = member` のユーザーが `DELETE /api/groups/:id` を呼ぶ
- **THEN** 403 を返し、group は削除されない

#### Scenario: 自分が所属していない group を指定する
- **WHEN** リクエストの `X-Active-Group-ID` と URL パスの `:id` が一致しない group を指定する
- **THEN** 403 を返し、group は削除されない

#### Scenario: 存在しない group を指定する
- **WHEN** 存在しない group ID を指定して `DELETE /api/groups/:id` を呼ぶ
- **THEN** 404 を返す

### Requirement: group 削除は stock_items を含めて一貫性を保つ

group を削除する際、その group に紐づく `stock_items` が残留してはならない MUST（`stock_items.group_id` の外部キー制約は `ON DELETE CASCADE` ではないため、削除処理側で明示的に対応する）。

#### Scenario: 商品が登録された group を削除する
- **WHEN** 商品が1件以上登録されている group に対して owner が `DELETE /api/groups/:id` を呼ぶ
- **THEN** 200 を返し、group と紐づく商品がすべて削除される（外部キー制約違反によるエラーにならない）
