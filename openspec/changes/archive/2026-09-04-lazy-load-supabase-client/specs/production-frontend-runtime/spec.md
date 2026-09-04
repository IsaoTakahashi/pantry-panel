## ADDED Requirements

### Requirement: Supabase SDK は全ページ共有の同期バンドルから分離し、非同期チャンクとして提供する

`@supabase/supabase-js` は `frontend/src/lib/supabaseClient.ts` 内部で動的 import する SHALL。モジュール評価時に読み込みを開始し、呼び出し元の実際の呼び出しタイミングを待たない MUST。

#### Scenario: Supabase SDK チャンクが全ページの初期読み込みに同期 `<script>` 参照として含まれない
- **WHEN** 本番ビルド(`next build --webpack`)を実行し、`/login` と `/stock-items` の生成 HTML が読み込む `<script>` チャンク一覧を確認する
- **THEN** `@supabase/supabase-js`(`GoTrueClient`/`RealtimeClient` を含むチャンク)への同期的な `<script>` 参照はどちらのページにも含まれない(モジュール評価時に動的 import で発火するため、実行時に非同期チャンクとして取得される。これは意図した設計(design.md Decision 1)であり、初回訪問後は Service Worker が `_next/static/chunks/*` を CacheFirst でプリキャッシュ済みのため低コスト)

#### Scenario: 並行フェッチの構造(Issue #236 の効果)が維持される
- **WHEN** Issue #236 の実測手法(storageState で warm セッションを再現、Playwright でネットワークタイミングを計測)を本変更後に再実行する
- **THEN** `GET /api/stock-items` が `GET /api/groups/me` の応答を待たずに開始される(具体的なミリ秒値は実行環境・タイミングに依存するため spec には記載しない。基準となる測定値は design.md および Issue #238/#236 のコメント履歴を参照)

#### Scenario: 認証機能自体の挙動は変更前と同じ
- **WHEN** ログイン・ログアウト・グループ切替・`/stock-items` での Supabase Realtime 経由のリアルタイム反映を行う
- **THEN** 変更前と同じ見た目・挙動で動作する
