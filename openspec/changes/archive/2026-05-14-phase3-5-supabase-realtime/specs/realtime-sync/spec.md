## ADDED Requirements

### Requirement: Frontend は Supabase Realtime で stock_items の変更を購読する
Frontend は `@supabase/supabase-js` の `postgres_changes` 機能で `public.stock_items` テーブルの INSERT / UPDATE / DELETE イベントを購読する MUST。購読は商品一覧ページ表示中のみアクティブで、ページ離脱時には MUST 解除される。

#### Scenario: ページマウントで購読が開始される
- **WHEN** ユーザーが商品一覧ページ (`/stock-items`) を開く
- **THEN** Supabase client が `stock_items` テーブルの postgres_changes channel に subscribe する
- **AND** channel status が `SUBSCRIBED` になる

#### Scenario: ページアンマウントで購読が解除される
- **WHEN** ユーザーが商品一覧ページから離脱する
- **THEN** Supabase client の channel が remove される
- **AND** WebSocket 接続が解放される

### Requirement: 受信イベントは REST 再取得で画面に反映する
Realtime から INSERT / UPDATE / DELETE のいずれかのイベントを受信した場合、Frontend は受信ペイロードを直接 state に適用するのではなく、`GET /api/stock-items` を呼び直して取得結果で一覧 state を置き換える MUST。

#### Scenario: 他端末で INSERT が発生したとき
- **WHEN** 端末 B で新しい商品が登録される (`POST /api/stock-items`)
- **AND** 端末 A の商品一覧ページが開いている
- **THEN** 端末 A の Realtime client が INSERT イベントを受信する
- **AND** 端末 A が `fetchStockItems()` を呼び、その結果で一覧を再描画する
- **AND** 新商品が `updated_at desc` の並びで先頭に表示される

#### Scenario: 他端末で UPDATE が発生したとき
- **WHEN** 端末 B で商品の wantToBuy / name / category のいずれかが更新される
- **AND** 端末 A の商品一覧ページが開いている
- **THEN** 端末 A が UPDATE イベントを受信して `fetchStockItems()` を呼び、新しい状態が画面に反映される

#### Scenario: 他端末で DELETE が発生したとき
- **WHEN** 端末 B で商品が削除される
- **AND** 端末 A の商品一覧ページが開いている
- **THEN** 端末 A が DELETE イベントを受信して `fetchStockItems()` を呼び、当該商品のカードが画面から消える

#### Scenario: 受信ペイロードは state へ直接マージしない
- **WHEN** Realtime イベントを受信する
- **THEN** イベントの `payload.new` / `payload.old` の内容を `setItems` に直接渡さない
- **AND** 必ず `fetchStockItems()` の結果で state を置き換える

### Requirement: Realtime 切断時は自動再接続し取りこぼしを修復する
Realtime 接続が一時的に切れた場合、`@supabase/supabase-js` が自動再接続を試みる SHALL。再接続成功時には Frontend は `fetchStockItems()` を呼んで、切断中に発生した変更を一覧に反映する MUST。

#### Scenario: ネットワーク断と復旧
- **WHEN** Realtime の WebSocket 接続が切断される
- **AND** 一定時間後にネットワークが復旧する
- **THEN** Supabase client が自動で再接続し、channel が再び `SUBSCRIBED` 状態に戻る
- **AND** 再接続完了時に Frontend は `fetchStockItems()` を呼んで一覧を最新化する

### Requirement: 環境変数未設定時は Realtime を無効化する
`NEXT_PUBLIC_SUPABASE_URL` または `NEXT_PUBLIC_SUPABASE_ANON_KEY` のいずれかが空または未定義の場合、Frontend は Realtime 購読を MUST NOT 開始する。コンソールに warn を 1 度出力する SHALL。REST CRUD は通常通り動作する MUST。

#### Scenario: ローカル開発で env が未設定
- **WHEN** `.env.local` に Supabase 関連の env が無い状態で frontend を起動する
- **THEN** ページは正常に読み込まれ、REST API 経由の CRUD は動作する
- **AND** Realtime channel への subscribe は実行されない
- **AND** ブラウザコンソールに「Supabase env vars not set, realtime disabled」相当の warn が 1 度だけ出力される

### Requirement: stock_items は Supabase Realtime publication に含まれる
Supabase Postgres において、`stock_items` テーブルは `supabase_realtime` publication に MUST 含まれる。これにより Postgres の row changes が Realtime サービスにブロードキャストされる。

#### Scenario: publication に含まれていることが確認できる
- **WHEN** Supabase Dashboard の Database → Replication 画面、または `pg_publication_tables` を確認する
- **THEN** `supabase_realtime` publication の対象テーブルに `public.stock_items` が含まれている

### Requirement: stock_items は RLS が有効で anon は SELECT のみ許可される
`stock_items` テーブルは Row-Level Security が有効化される MUST。`anon` ロールには SELECT のみ許可するポリシーが MUST 設定される。`anon` ロールの INSERT / UPDATE / DELETE は MUST 拒否される。`service_role` および `postgres` ロール（Lambda 接続）は RLS を素通りする SHALL。

#### Scenario: anon は SELECT できる
- **WHEN** anon key を持つクライアントが Supabase JS で `stock_items` を SELECT する
- **THEN** 全行が返る

#### Scenario: anon は INSERT を拒否される
- **WHEN** anon key を持つクライアントが Supabase JS で `stock_items` に INSERT を試みる
- **THEN** PostgreSQL が `permission denied` または RLS 違反でエラーを返す

#### Scenario: anon は UPDATE / DELETE を拒否される
- **WHEN** anon key を持つクライアントが `stock_items` に UPDATE / DELETE を試みる
- **THEN** PostgreSQL が `permission denied` または RLS 違反でエラーを返す

#### Scenario: Lambda 経由の書込みは引き続き成功する
- **WHEN** Lambda が `DATABASE_URL`（postgres ロール）経由で `stock_items` に INSERT / UPDATE / DELETE する
- **THEN** RLS を素通りして正常に書込まれる
- **AND** Realtime に変更がブロードキャストされる

### Requirement: 複数端末で Realtime 同期が動作することを E2E で検証する
Playwright E2E テストで、2 つの BrowserContext を起動して片方の変更がもう片方に伝播することを MUST 検証する。env 未設定時は test.skip で許容される MAY。

#### Scenario: 他端末の INSERT が反映される
- **WHEN** 2 つの BrowserContext (A, B) が商品一覧ページを開く
- **AND** Context A で新規商品 `テスト商品-{uuid}` を登録する
- **THEN** Context B にも当該商品のカードが 5 秒以内に表示される（手動 reload なし）

#### Scenario: 他端末の wantToBuy トグルが反映される
- **WHEN** Context A で対象商品の wantToBuy トグルをクリックする
- **THEN** Context B の同商品カードのトグルが `aria-pressed="true"` に 5 秒以内に変化する

#### Scenario: 他端末の DELETE が反映される
- **WHEN** Context A で wantToBuy=false の商品を削除する
- **THEN** Context B の画面から当該商品カードが 5 秒以内に消える

#### Scenario: env 未設定時のスキップ
- **WHEN** E2E 実行時に `PLAYWRIGHT_SUPABASE_URL` / `PLAYWRIGHT_SUPABASE_ANON_KEY` が未設定
- **THEN** `realtime-sync.spec.ts` の全ケースが `test.skip` でスキップされる
- **AND** 既存の他の E2E テストには影響しない
