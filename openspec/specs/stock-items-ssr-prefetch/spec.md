# stock-items-ssr-prefetch Specification

## Purpose
`/stock-items` の初回表示で、初期HTMLに実データを埋め込んだまま応答までの時間を短縮する。サーバー側の在庫取得は 1 アクセスにつき 1 回とし、トークンの検証はその Go API 呼び出しが担う（Issue #306 で middleware の先読みと並行取得を廃止）。

## Requirements

### Requirement: SSRは初期HTMLに実データを埋め込む
`/stock-items` のサーバーサイドレンダリングは、クライアントのJavaScriptが実行される前の初期HTMLレスポンスに、実際の在庫アイテム一覧を埋め込む SHALL。

#### Scenario: JavaScript無効でも商品一覧が見える
- **WHEN** 有効なセッションを持つユーザーが `/stock-items` にアクセスし、ブラウザのJavaScriptが無効になっている
- **THEN** 初期HTMLレスポンスに、そのユーザーのグループの実在庫アイテム一覧が描画済みの状態で含まれる

### Requirement: 区間ごとの所要時間を観測可能にする
セッションの判定と在庫データの取得のそれぞれについて、リクエスト単位の所要時間を観測できる情報を記録する SHALL。

#### Scenario: 各区間の所要時間が記録される
- **WHEN** `/stock-items` へのリクエストが処理される
- **THEN** middleware でのセッション判定にかかった時間と、SSR での在庫データ取得にかかった時間が、それぞれ区別可能な形で記録される

### Requirement: 1 回のアクセスで在庫の取得は 1 回だけ行う

`/stock-items` への 1 回のアクセスで、サーバー側から Go API の在庫一覧取得を呼ぶ回数は最大 1 回とする SHALL。グループの在庫件数やデータの大きさによって、この回数が変わってはならない MUST NOT。

#### Scenario: 件数の多いグループでも在庫の取得は 1 回
- **WHEN** 82 件以上の在庫を持つグループに所属し、有効なセッションを持つユーザーが `/stock-items` にアクセスする
- **THEN** サーバー側での Go API の在庫一覧取得は 1 回だけ行われ、初期 HTML にそのグループの全在庫が描画される

### Requirement: SSR はセッション cookie からアクセストークンを読み取り、読めないときはクライアント取得に任せる

`/stock-items` の SSR は、Supabase クライアントを介さずに `sb-{project-ref}-auth-token` のセッション cookie からアクセストークンを読み取り、在庫の取得に使う SHALL。cookie の大きさ（分割されていない 1 個か、`.0`、`.1`、… の複数 chunk か）や形式（`base64-` 接頭辞付き、または接頭辞のない旧形式の生 JSON）によって、読み取れるかどうかが変わってはならない MUST NOT。cookie が壊れている・欠けているときは、例外を投げずに SSR での取得をあきらめ、クライアント側の取得に任せる SHALL。このとき、そのセッションのものではない値をアクセストークンとして使ってはならない MUST NOT（誤ったトークンは Go API の 401 を経由して強制ログアウトにつながるため）。

#### Scenario: セッションの大きさに関係なくアクセストークンを読み取る
- **WHEN** 有効なセッションを持つユーザーが `/stock-items` にアクセスし、セッション cookie が `user_metadata` の大きさ（日本語・絵文字を含む）によって分割されていない 1 個、または複数の chunk になっている
- **THEN** SSR は元のセッションの `access_token` を読み取り、それを使って在庫を取得する

#### Scenario: 旧形式（生 JSON）の cookie からもアクセストークンを読み取る
- **WHEN** `base64-` 接頭辞のない生 JSON のセッション cookie（分割されていない、または分割されている）を持つユーザーが `/stock-items` にアクセスする
- **THEN** SSR は生 JSON の `access_token` を読み取る

#### Scenario: 他の cookie が混ざっていても正しい cookie からトークンを選ぶ
- **WHEN** セッション cookie に加えて、無関係な名前の cookie、別の Supabase プロジェクトの `sb-{other}-auth-token`、または同じキーの分割されていない cookie と chunk が同時にある
- **THEN** 無関係な cookie・別プロジェクトの cookie は結果に影響せず、同じキーの分割されていない cookie と chunk が同時にあるときは分割されていない方からトークンを読み取る

#### Scenario: cookie が壊れていても SSR は落ちず、クライアント取得にフォールバックする
- **WHEN** 古い chunk が末尾に残っている、途中の chunk が欠けている、cookie 値が base64url / JSON として不正、または `access_token` が文字列でない・欠けている状態で `/stock-items` にアクセスする
- **THEN** SSR は例外を投げず、そのセッションの `access_token` 以外の値を使わない。トークンを読み取れないときは Go API を呼ばずに初期在庫なしで描画し、クライアント側が通常どおり在庫を取得する
