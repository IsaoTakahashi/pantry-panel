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
`AuthGuard` は `loading` が `false` になった後の確定済み `group` の状態のみに基づいてリダイレクトを判断する SHALL。`speculativeGroupId` の有無はリダイレクト判断に使用しない MUST。未ログイン時のリダイレクトは `middleware`（`ssr-session-auth` capability）が担い、`AuthGuard` はこれを行わない MUST NOT。

#### Scenario: loading 完了後にグループが無ければ no-group へリダイレクトする
- **WHEN** `loading` が `false` になり `session` はあるが `group` が `null` である(推測グループIDの有無に関わらず)
- **THEN** `/no-group` へリダイレクトする

#### Scenario: loading 中は推測グループIDだけでリダイレクトしない
- **WHEN** `loading` が `true` である
- **THEN** `speculativeGroupId` の有無に関わらずリダイレクトは発生しない

### Requirement: 受動的なセッション喪失時にフォールバックUIを表示する

`AuthGuard` は、`loading` が `false` かつ `session` が `null`（かつ Supabase 認証が有効）の場合、children の代わりにログインを促すメッセージと `/login` へのリンクを表示する SHALL。この分岐は「別タブでの signOut 等による受動的なセッション喪失」だけでなく「同一タブでの意図的なサインアウト直後」にも一瞬通過しうるため、表示するメッセージは原因（受動的喪失か意図的サインアウトか）を断定しない中立的な内容とする MUST（例: 「セッションが切れました」のような、意図的サインアウト直後には事実と異なる確定的な文言を用いない）。この表示はリダイレクトを伴わない MUST NOT（`router.push`/`router.replace` 等のナビゲーションを呼ばない）。

#### Scenario: 別タブでのサインアウト等により session が null になった場合にフォールバックUIを表示する
- **WHEN** `loading` が `false` になり `session` が `null` である(ページ遷移を伴わずクライアント側で session が失われた場合を含む)
- **THEN** children の代わりに中立的なログイン誘導メッセージと `/login` へのリンクが表示される
- **AND** 自動的なリダイレクト(`router.push`/`router.replace` 等)は発生しない

#### Scenario: 意図的なサインアウト直後に一瞬表示されても文言が事実と矛盾しない
- **WHEN** ユーザー自身の操作による `signOut()` 呼び出し直後、`router.replace("/login")` によるナビゲーションが完了する前の一瞬に `loading===false && session===null` の状態でレンダーされる
- **THEN** 表示されるメッセージは「セッションが切れました」のような受動的喪失を断定する文言ではなく、意図的サインアウトの直後に見えても事実と矛盾しない中立的な文言である

#### Scenario: loading 中はフォールバックUIを表示しない
- **WHEN** `loading` が `true` である
- **THEN** `session` が `null` であってもフォールバックUIは表示されない(既存の loading 中のレンダー分岐が優先される)
