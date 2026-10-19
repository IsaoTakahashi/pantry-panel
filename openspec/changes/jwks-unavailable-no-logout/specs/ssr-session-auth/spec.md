## MODIFIED Requirements

### Requirement: /stock-items ではトークンの署名検証を Go API に委ねる

`/stock-items` へのリクエストでは、トークンの署名とグループ所属の検証を Go API が担う SHALL。SSR が Go API から在庫を取得したとき、Go API が 401 を返し、かつ cookie のアクセストークンが期限内である場合、そのトークンは確定的に無効とみなす MUST。この場合、在庫データを含む HTML を返さず、`sb-*-auth-token` 系のセッション cookie（チャンク分割されたものを含む）を失効させる `/auth/clear-session` を経由して `/login` へ送る SHALL。本番のストリーミング応答では、`/stock-items` の応答は 3xx ではなく 200 + HTML 内のリダイレクト（RSC ペイロードの redirect digest）になりうる。cookie のアクセストークンが期限切れである場合（middleware での更新が一時的な障害で失敗し、fail open で通過した場合）は、`/login` へリダイレクトしてはならない MUST NOT。

Go API は、トークンの検証に必要な鍵を解決できない場合（JWKS を取得できていない、または未知の kid）、401 ではなく 503 を返す SHALL。トークン自体に問題がある場合（署名が不正、期限切れ、必要なヘッダーが無い等）は 401 を返す SHALL。鍵の解決を最初に判定するので、kid を解決できないトークンは、期限切れや署名不正でもある場合でも 503 を返す SHALL。SSR は Go API の 503 を受けたとき、`/login` へリダイレクトしてはならず MUST NOT、セッション cookie も消さない。

#### Scenario: 署名が不正なトークンでは在庫が返らず /login へ送られる
- **WHEN** 期限内だが署名が不正なアクセストークンを含むセッション cookie で `/stock-items` にアクセスする
- **THEN** 応答は `/auth/clear-session` へのリダイレクト（3xx、または本番のストリーミング応答では 200 + HTML 内のリダイレクト）となり、セッション cookie は失効させられたうえで `/login` に着地し、在庫データは応答のどこにも含まれない

#### Scenario: 一時的な障害で期限切れのまま通過した場合はログアウトさせない
- **WHEN** アクセストークンが期限切れで、middleware での更新が一時的な障害で失敗し、`/stock-items` の SSR が Go API から 401 を受け取る
- **THEN** `/login` へはリダイレクトされず、セッション cookie も消されず、ページはクライアント側の取得にフォールバックして表示される

#### Scenario: Go API が鍵を解決できないときはログアウトさせない
- **WHEN** Go API が JWKS を取得できておらず（または未知の kid で）、期限内の正規のトークンで `/stock-items` にアクセスする
- **THEN** Go API は 503 を返し、`/login` へはリダイレクトされず、セッション cookie も消されず、在庫データは応答に含まれず、ページはクライアント側の取得にフォールバックする

#### Scenario: Go API は鍵を解決できない場合とトークンが不正な場合を区別する
- **WHEN** Go API の JWT 保護エンドポイントに、検証用の鍵ストアに存在しない kid のトークン、または鍵ストアの鍵で検証できない署名のトークンを送る
- **THEN** 前者には 503、後者には 401 が返り、どちらでも後続のハンドラは呼ばれない
