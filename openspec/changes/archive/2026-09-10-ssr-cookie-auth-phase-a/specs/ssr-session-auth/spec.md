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
- **WHEN** セッションリフレッシュ処理が失敗する（ネットワーク障害等の retryable なエラーだけでなく、署名検証失敗等でトークンが確定的に無効と判定された場合を含む、現状の実装は両者を区別しない）
- **THEN** リクエストはブロックされずに後続の処理（ページレンダリング等）に進む

**重要（アーキテクチャ上の注意、最終ブランチレビューで発見）**: middleware のセッション確認は UX 向上のためのゲートであり、認可の境界ではない。サーバー側でデータを扱う経路（Server Component・Route Handler・Server Action 等）は、middleware を通過したことに関わらず、各経路が独立してセッション・認可を検証する SHALL。本 change（Phase A）の対象範囲では `/stock-items` はクライアント側シェルであり、実データは backend が JWT を独立検証した上で返すため実害はないが、Phase B（stock-items の Server Component 化）でサーバー側から直接データを返す経路を追加する場合は、この独立検証を省略してはならない。

**既知の制約（Known Limitation）**: 現状の fail open は「セッション状態を確定できない場合（retryable）」と「トークンが確定的に無効と判定された場合（署名検証失敗等）」を区別せず、両方とも fail open する。前者のみを fail open 対象とし、後者は未ログイン扱いとして扱う（保護ルートであれば `/login` へリダイレクトする）よう改善する余地がある。Phase A の範囲では実害はない（上記の理由）が、Phase B でサーバー側データ経路を追加する前にこの区別を実装することを推奨する。

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
