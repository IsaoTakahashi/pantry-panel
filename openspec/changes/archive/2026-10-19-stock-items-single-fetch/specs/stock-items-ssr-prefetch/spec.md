## ADDED Requirements

### Requirement: 1 回のアクセスで在庫の取得は 1 回だけ行う

`/stock-items` への 1 回のアクセスで、サーバー側から Go API の在庫一覧取得を呼ぶ回数は最大 1 回とする SHALL。グループの在庫件数やデータの大きさによって、この回数が変わってはならない MUST NOT。

#### Scenario: 件数の多いグループでも在庫の取得は 1 回
- **WHEN** 82 件以上の在庫を持つグループに所属し、有効なセッションを持つユーザーが `/stock-items` にアクセスする
- **THEN** サーバー側での Go API の在庫一覧取得は 1 回だけ行われ、初期 HTML にそのグループの全在庫が描画される

## MODIFIED Requirements

### Requirement: 区間ごとの所要時間を観測可能にする
セッションの判定と在庫データの取得のそれぞれについて、リクエスト単位の所要時間を観測できる情報を記録する SHALL。

#### Scenario: 各区間の所要時間が記録される
- **WHEN** `/stock-items` へのリクエストが処理される
- **THEN** middleware でのセッション判定にかかった時間と、SSR での在庫データ取得にかかった時間が、それぞれ区別可能な形で記録される

## REMOVED Requirements

### Requirement: 認証検証と在庫データ取得を並行実行する
**Reason**: middleware が先読みしたデータを page へ渡す手段がヘッダーしかなく、件数の多いグループでは上限を超えて常に Go API を 2 回呼んでいた（Issue #306）。`/stock-items` では middleware が署名を検証しなくなり、期限内のトークンなら通信が発生しないため、並行化する対象の待ち時間自体がなくなる。
**Migration**: SSR が Go API を 1 回だけ呼ぶ。署名の検証はその Go API 呼び出しが担う（spec `ssr-session-auth`「/stock-items ではトークンの署名検証を Go API に委ねる」）。

### Requirement: 未認証時は並行取得したデータを破棄する
**Reason**: 並行取得を廃止したため。
**Migration**: 不正なトークンでは Go API が 401 を返し、在庫データはそもそも取得されない（spec `ssr-session-auth`「/stock-items ではトークンの署名検証を Go API に委ねる」）。

### Requirement: 事前取得データが使えない場合はフォールバック取得する
**Reason**: 事前取得（ヘッダーでの受け渡し）を廃止したため。SSR は常に自分で 1 回取得する。
**Migration**: Requirement「1 回のアクセスで在庫の取得は 1 回だけ行う」に置き換える。
