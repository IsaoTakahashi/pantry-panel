## ADDED Requirements

### Requirement: PPR is enabled globally
Next.js の `experimental.ppr` を `true` に設定し、アプリ全体で PPR を有効にする SHALL。

#### Scenario: PPR flag is set
- **WHEN** `next.config.ts` の `experimental.ppr` が `true`
- **THEN** Next.js ビルド時に PPR が有効化され、Suspense 境界で静的・動的部分が分離される

### Requirement: Dynamic content is wrapped in Suspense boundaries
在庫リスト等のデータフェッチを伴うコンポーネントは `<Suspense>` で囲い、静的シェルと分離する SHALL。

#### Scenario: Page loads with cold start
- **WHEN** コールドスタート後に在庫一覧ページを開く
- **THEN** ヘッダー・ナビ等の静的シェルが即座に表示され、在庫リストはスケルトン UI を経てデータが埋まる

#### Scenario: Suspense fallback is shown during data fetch
- **WHEN** 在庫リストのデータフェッチが完了していない
- **THEN** スケルトン UI（loading skeleton）が表示される

### Requirement: Static shell is served from CDN
PPR により静的シェル部分は CDN にキャッシュされ、サーバー処理を経ずに配信される SHALL。

#### Scenario: Static shell is pre-rendered
- **WHEN** ページがリクエストされる
- **THEN** `<Suspense>` 外の静的部分はサーバー処理なしに CDN から返される
