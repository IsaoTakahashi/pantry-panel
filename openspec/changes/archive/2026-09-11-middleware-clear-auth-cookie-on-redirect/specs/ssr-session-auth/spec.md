## MODIFIED Requirements

### Requirement: middleware は未ログイン時に保護ルートから /login へリダイレクトする

`middleware.ts` は、有効なセッション cookie が無い状態で保護対象のルートにアクセスされた場合、`/login` へサーバー側でリダイレクトする SHALL。確定的に無効なセッション（`isDefinitelyUnauthenticated`）と判定されて redirect する場合、`sb-*-auth-token` 系のセッション cookie（`.0`, `.1` 等のチャンク分割された cookie を含む）を redirect レスポンス上で失効させる SHALL。これにより、client 側の cookie ベースのセッション判定（`getSession()`）が同じ無効な cookie を見て保護ルートへ押し戻す redirect ループを防ぐ。

#### Scenario: 未ログインで保護ルートにアクセスするとリダイレクトされる
- **WHEN** セッション cookie を持たないユーザーが `/stock-items` 等の保護ルートにアクセスする
- **THEN** クライアント側 JS の実行を待たずに `/login` へリダイレクトされる

#### Scenario: 確定的に無効なトークンによる redirect 時、セッション cookie が失効させられる
- **WHEN** 確定的に無効と判定されたセッション cookie（例: 署名検証失敗の `AuthInvalidJwtError`）を持つユーザーが保護ルートにアクセスする
- **THEN** `/login` へリダイレクトされ、かつそのレスポンスで `sb-*-auth-token` 系の cookie（チャンク分割されたものを含む）が失効（空値・即時期限切れ）した状態で返される
