# stock-items-ssr-prefetch Specification

## Purpose
`/stock-items` の初回表示で、認証検証と在庫データ取得を並行して行い、初期HTMLに実データを埋め込んだまま応答までの時間を短縮する。

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
