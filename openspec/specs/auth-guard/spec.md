# auth-guard Specification

## Purpose
認証済みユーザーのみが保護されたページ配下のコンテンツにアクセスできるようにする認証ゲートコンポーネント。`session`・確定 `group`・推測 `speculativeGroupId` の状態に応じてレンダー可否とリダイレクト先(`/login`, `/no-group`)を判断する。

## Requirements

### Requirement: 認証済みかつグループ確定または推測できる場合に子要素をレンダーする
`AuthGuard` は、Supabase 認証が有効な環境で、`session` があり、かつ `group`(確定グループ)または `speculativeGroupId`(`localStorage` にキャッシュされた推測グループ ID)のいずれかが存在する場合、`loading` の完了を待たずに children をレンダーする SHALL。

#### Scenario: セッションと確定グループがあれば即座にレンダーする
- **WHEN** `session` と `group` が両方存在する
- **THEN** `loading` の値に関わらず children がレンダーされる

#### Scenario: セッションと推測グループIDがあれば groups 確定前でもレンダーする
- **WHEN** `session` が存在し、`group` は未確定(`null`)だが `speculativeGroupId` が存在する
- **THEN** `loading` が `true` であっても children がレンダーされる

#### Scenario: セッションはあるが推測グループIDも確定グループも無い場合は待機する
- **WHEN** `session` が存在し、`group` も `speculativeGroupId` も無い
- **AND** `loading` が `true` である
- **THEN** children はレンダーされず `null` を返す

### Requirement: 確定結果に基づいてのみリダイレクトする
`AuthGuard` は `loading` が `false` になった後の確定済み `session`・`group` の状態のみに基づいてリダイレクトを判断する SHALL。`speculativeGroupId` の有無はリダイレクト判断に使用しない MUST。

#### Scenario: loading 完了後にセッションが無ければログインへリダイレクトする
- **WHEN** `loading` が `false` になり `session` が `null` である
- **THEN** `/login` へリダイレクトする

#### Scenario: loading 完了後にグループが無ければ no-group へリダイレクトする
- **WHEN** `loading` が `false` になり `session` はあるが `group` が `null` である(推測グループIDの有無に関わらず)
- **THEN** `/no-group` へリダイレクトする

#### Scenario: loading 中は推測グループIDだけでリダイレクトしない
- **WHEN** `loading` が `true` である
- **THEN** `speculativeGroupId` の有無に関わらずリダイレクトは発生しない
