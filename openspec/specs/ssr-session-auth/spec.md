# ssr-session-auth Specification

## Purpose
`@supabase/ssr` による cookie ベースのセッション管理を提供する。ブラウザの `localStorage` ではなく cookie にセッションを保存することで、Server Component や Route Handler などサーバー側の経路からも認証状態を判断できるようにする。`middleware.ts` が全リクエストでセッション cookie のリフレッシュを試み（失敗時は fail open）、未ログイン時には保護ルートから `/login` へサーバー側でリダイレクトする。また、OAuth サインインフローを標準の PKCE + コールバックルート方式（`/auth/callback`）に置き換え、認可コードのセッション交換をサーバー側で行い cookie に書き込む契約を定義する。

## Requirements

### Requirement: セッションは cookie ベースで管理される

認証セッションは `@supabase/ssr` により cookie に保存される SHALL。ブラウザの `localStorage` にはセッション情報を保存しない MUST。

#### Scenario: サインイン後、セッションが cookie に保存される
- **WHEN** ユーザーが Google サインインを完了する
- **THEN** セッション情報が cookie に保存され、`localStorage` にはセッション関連のキーが書き込まれない

### Requirement: middleware は全リクエストでセッションをリフレッシュする

`middleware.ts` は全ページリクエストに対してセッション cookie のリフレッシュを試みる SHALL。**セッション状態を確定できない場合**（ネットワーク障害等の retryable なエラー、または並行する `signOut` によりリフレッシュ結果が破棄された場合）は、リクエストの処理を継続する MUST（fail open）。一方、**トークンが確定的に無効と判定された場合**（署名検証失敗等）は、fail open の対象としない MUST NOT——未ログイン扱いとして扱い、保護ルートであれば通常の未ログインリダイレクト（次の Requirement）に従う。

#### Scenario: 有効なセッションはリフレッシュされる
- **WHEN** 有効なセッション cookie を持つユーザーがページに遷移する
- **THEN** セッション cookie が最新の状態にリフレッシュされる

#### Scenario: リフレッシュ失敗時もリクエストを継続する（fail open は retryable なエラー・discard 系のレースに限る）
- **WHEN** セッションリフレッシュ処理が一時的な障害（ネットワーク断・Supabase 側の retryable なエラー等）で失敗する、または並行する `signOut` によってリフレッシュ結果が破棄される
- **THEN** リクエストはブロックされずに後続の処理（ページレンダリング等）に進む

#### Scenario: 確定的に無効なトークンは fail open の対象外
- **WHEN** セッション cookie は存在するが、トークンの署名検証失敗等により確定的に無効と判定される
- **THEN** fail open せず、未ログイン扱いとして扱う（保護ルートであれば `/login` へリダイレクトする）

**重要（アーキテクチャ上の注意）**: middleware のセッション確認は UX 向上のためのゲートであり、認可の境界ではない。サーバー側でデータを扱う経路（Server Component・Route Handler・Server Action 等）は、middleware を通過したことに関わらず、各経路が独立してセッション・認可を検証する SHALL。本 Requirement の改善（fail open の対象を狭めること）は、middleware 通過＝認可済みという前提を作るものではない。

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
