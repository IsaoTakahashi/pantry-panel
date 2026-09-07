## ADDED Requirements

### Requirement: セッションは cookie ベースで管理される

認証セッションは `@supabase/ssr` により cookie に保存される SHALL。ブラウザの `localStorage` にはセッション情報を保存しない MUST。

#### Scenario: サインイン後、セッションが cookie に保存される
- **WHEN** ユーザーが Google サインインを完了する
- **THEN** セッション情報が cookie に保存され、`localStorage` にはセッション関連のキーが書き込まれない

### Requirement: middleware は全リクエストでセッションをリフレッシュする

`middleware.ts` は全ページリクエストに対してセッション cookie のリフレッシュを試みる SHALL。リフレッシュに失敗してもリクエストの処理は継続する MUST（fail open）。

#### Scenario: 有効なセッションはリフレッシュされる
- **WHEN** 有効なセッション cookie を持つユーザーがページに遷移する
- **THEN** セッション cookie が最新の状態にリフレッシュされる

#### Scenario: リフレッシュ失敗時もリクエストを継続する
- **WHEN** セッションリフレッシュ処理が一時的な障害で失敗する
- **THEN** リクエストはブロックされずに後続の処理（ページレンダリング等）に進む

### Requirement: middleware は未ログイン時に保護ルートから /login へリダイレクトする

`middleware.ts` は、有効なセッション cookie が無い状態で保護対象のルートにアクセスされた場合、`/login` へサーバー側でリダイレクトする SHALL。

#### Scenario: 未ログインで保護ルートにアクセスするとリダイレクトされる
- **WHEN** セッション cookie を持たないユーザーが `/stock-items` 等の保護ルートにアクセスする
- **THEN** クライアント側 JS の実行を待たずに `/login` へリダイレクトされる

### Requirement: OAuth サインインは PKCE + コールバックルートで完結する

OAuth サインインフローは、Google からのリダイレクト先を `/auth/callback` とし、同ルートで認可コードをセッションに交換して cookie に書き込む SHALL。

#### Scenario: 通常のログインで /stock-items に到達する
- **WHEN** `/login` から Google サインインを行う
- **THEN** `/auth/callback` を経由してセッションが確立され、`/stock-items` にリダイレクトされる

#### Scenario: 招待リンク経由のログインで元の join URL に戻る
- **WHEN** `/join?token=xxx` から Google サインインを行う
- **THEN** `/auth/callback` を経由してセッションが確立され、`/join?token=xxx` にリダイレクトされる

#### Scenario: コード交換に失敗した場合はエラー付きで /login に戻る
- **WHEN** `/auth/callback` での `exchangeCodeForSession` が失敗する
- **THEN** エラーメッセージ付きで `/login` にリダイレクトされる
