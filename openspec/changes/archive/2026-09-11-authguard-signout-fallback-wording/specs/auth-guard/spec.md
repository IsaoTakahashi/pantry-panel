## MODIFIED Requirements

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
