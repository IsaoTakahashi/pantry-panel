## MODIFIED Requirements

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
