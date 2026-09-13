## ADDED Requirements

### Requirement: Protected routes are warmed via an authenticated internal round-trip
`/stock-items` のような認証必須ルートは、外部スケジューラから直接ping SHALL NOT（未認証リクエストは middleware のリダイレクトで完結し、ページ本体の関数を起動しないため）。代わりに、専用の warm-up エンドポイント（例: `/api/warm/stock-items`）が、有効なセッションを自ら確立した上でこのアプリ自身の `/stock-items` に対してサーバーサイドから認証済みリクエストを発行する SHALL。

#### Scenario: Warm-up endpoint authenticates internally
- **WHEN** cron-job.org が warm-up エンドポイントを2分間隔でpingする
- **THEN** warm-up エンドポイントは有効なセッションcookieを構築し、それを付けて自身の `/stock-items` にリクエストを送る

#### Scenario: Non-200 from the internal request is a failure
- **WHEN** warm-up エンドポイントが内部的に叩いた `/stock-items` が 200 以外（特に `/login` への 3xx リダイレクト）を返す
- **THEN** warm-up エンドポイント自身も非200を返し、cron-job.org 側で失敗として検知できる

### Requirement: Fixed session cookies are not used for authenticated warmup
外部スケジューラに固定の `Cookie` ヘッダーを設定する方式は使用してはならない SHALL NOT。Supabaseのrefresh tokenはローテーションするため、固定cookieは最初のトークンリフレッシュ後に無効化され、以降のpingが静かに未認証扱いになる。

#### Scenario: Session must be established fresh or refreshed by the warmup code itself
- **WHEN** warm-up エンドポイントがセッションを用意する
- **THEN** そのセッションは当該リクエスト処理の中で sign-in または refresh されたものであり、外部から渡された固定値ではない

### Requirement: Warmup credentials are isolated from test fixtures
認証込みwarm-upに使うSupabaseユーザーは、E2Eテストで使用するユーザー（`E2E_TEST_EMAIL`等）と別のものを使う SHALL。同一プロジェクトであっても、CIのテストフィクスチャと本番warm-upのライフサイクルを結合させてはならない。

#### Scenario: Warm user is independent of E2E fixtures
- **WHEN** E2Eテスト用アカウントのパスワードがローテーションされる、またはアカウントが削除される
- **THEN** 本番warm-upの認証は影響を受けない（別アカウントのため）

### Requirement: Warmup endpoint requires a shared secret
認証込みwarm-upエンドポイントは、共有シークレットを検証せずにリクエストを受け付けてはならない SHALL NOT。シークレットが一致しない場合は 401 を返し、Supabase へのsign-inを試みてはならない。

#### Scenario: Missing or invalid secret is rejected before sign-in
- **WHEN** warm-upエンドポイントへのリクエストに正しい共有シークレットヘッダーが含まれていない
- **THEN** エンドポイントは401を返し、Supabaseへのsign-inリクエストを発行しない

### Requirement: Warmup endpoint fails loudly on missing configuration
warm-upエンドポイントが依存する必須の環境変数（Supabase接続情報、warmユーザー資格情報、warm対象グループID、内部fetch先オリジン）のいずれかが未設定の場合、空値のまま処理を続行してはならない SHALL NOT。共有シークレットの検証を通過した後、これらの必須値を検証し、欠落している場合はどの変数が欠落しているかを示す診断可能なエラーを返す SHALL。

#### Scenario: Missing required env var produces a diagnosable failure, not a false-positive success
- **WHEN** warm-upエンドポイントが依存する必須環境変数（例: warm対象グループID）が未設定の状態でpingされる
- **THEN** エンドポイントは200ではなく、欠落した変数名を含む非200レスポンスを返す（内部的に`/stock-items`がクライアント側フォールバックで200を返してしまい、バックエンドへの実際のフェッチが行われないまま警告なく成功扱いになることを防ぐ）

### Requirement: Internal warmup request targets a fixed origin, not a request-derived one
warm-upエンドポイントが自身の`/stock-items`に対して発行する内部リクエスト（有効なセッションcookieを含む）の宛先は、固定の設定値から得る SHALL。受信したリクエストのHost/Originから宛先を導出してはならない SHALL NOT。

#### Scenario: Internal fetch target is independent of the inbound request's origin
- **WHEN** warm-upエンドポイントへの受信リクエストのOriginが、設定されたwarm対象オリジンと異なる
- **THEN** 内部fetchは受信リクエストのOriginではなく、設定されたwarm対象オリジンに対して送信される
