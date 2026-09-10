## ADDED Requirements

### Requirement: 受動的なセッション喪失時にフォールバックUIを表示する

`AuthGuard` は、`loading` が `false` かつ `session` が `null`（かつ Supabase 認証が有効）の場合、children の代わりに「セッションが切れました」旨のメッセージと `/login` へのリンクを表示する SHALL。この表示はリダイレクトを伴わない MUST NOT（`router.push`/`router.replace` 等のナビゲーションを呼ばない）。

#### Scenario: 別タブでのサインアウト等により session が null になった場合にフォールバックUIを表示する
- **WHEN** `loading` が `false` になり `session` が `null` である（ページ遷移を伴わずクライアント側で session が失われた場合を含む）
- **THEN** children の代わりに「セッションが切れました」旨のメッセージと `/login` へのリンクが表示される
- **AND** 自動的なリダイレクト（`router.push`/`router.replace` 等）は発生しない

#### Scenario: loading 中はフォールバックUIを表示しない
- **WHEN** `loading` が `true` である
- **THEN** `session` が `null` であってもフォールバックUIは表示されない（既存の loading 中のレンダー分岐が優先される）
