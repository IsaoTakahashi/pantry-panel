# production-frontend-runtime Specification

## Purpose
TBD - created by archiving change phase2-5c-vercel-frontend-deploy. Update Purpose after archive.
## Requirements
### Requirement: Frontend は NEXT_PUBLIC_API_BASE_URL で API ベース URL を切り替える
Frontend は `NEXT_PUBLIC_API_BASE_URL` 環境変数を読み取り、すべての API 呼び出しのベース URL に使用する SHALL。未設定時は `http://localhost:8080` を使用する MUST。

#### Scenario: 環境変数指定で動作
- **WHEN** Frontend を `NEXT_PUBLIC_API_BASE_URL=https://example.lambda-url.ap-northeast-1.on.aws` でビルド・起動する
- **THEN** すべての fetch リクエストの URL が `https://example.lambda-url.ap-northeast-1.on.aws/...` で始まる

#### Scenario: 未設定時はローカル
- **WHEN** Frontend を `NEXT_PUBLIC_API_BASE_URL` 未設定で起動する
- **THEN** すべての fetch リクエストの URL が `http://localhost:8080/...` で始まる

### Requirement: Frontend は Vercel 上で公開される
Frontend は Vercel にホストされ、`*.vercel.app` の HTTPS URL で外部から到達可能 SHALL。

#### Scenario: 本番 URL に到達できる
- **WHEN** ブラウザで `https://<vercel-url>/stock-items` を開く
- **THEN** 商品一覧ページが表示される

#### Scenario: main へのマージで自動デプロイ
- **WHEN** GitHub の main ブランチに変更が push される
- **THEN** Vercel が自動でビルド・デプロイし、本番 URL が更新される

### Requirement: 本番 URL から Phase 1-2 の全機能が動作する
本番の Frontend (Vercel) と本番の Backend (Lambda) と本番の DB (Supabase) が連携して、Phase 1-2 の機能が全て SHALL 動作する。

#### Scenario: 商品 CRUD
- **WHEN** 本番 URL から商品を登録・編集・削除する
- **THEN** 操作が成功し、Supabase 側にも反映される

#### Scenario: wantToBuy トグル
- **WHEN** 本番 URL でカートアイコンをクリックする
- **THEN** トグルが切り替わり、Supabase に保存される

#### Scenario: フィルタ・シンプルビュー
- **WHEN** 本番 URL でフィルタ操作・表示モード切替を行う
- **THEN** Phase 2 / Phase 4 の挙動どおりに動作する

### Requirement: Vercel プロジェクトの Root Directory は `frontend/` に設定する
monorepo 構成のため、Vercel プロジェクト設定で Root Directory を `frontend/` に MUST 指定する。

#### Scenario: ビルドが frontend のみ対象
- **WHEN** Vercel のビルドログを確認する
- **THEN** `frontend/` 配下のみがビルド対象になっている（backend ファイルは無視）

### Requirement: `/stock-items` の framer-motion エンジンは非同期チャンクとして分離する

`/stock-items` ルートで使用する framer-motion のアニメーションエンジン本体(`domMax` feature bundle: drag・レイアウトアニメーションを含む)は `LazyMotion` の非同期 `features` ロードで供給する SHALL。モーダル(`ConfirmDialog` を含む全モーダル)は `next/dynamic({ssr:false})` で遅延ロードする MUST。

#### Scenario: framer-motion エンジンチャンクが他ページの初期読み込みに同期 `<script>` 参照として含まれない
- **WHEN** 本番ビルド(`next build --webpack`)を実行し、`/login` の生成 HTML が読み込む `<script>` チャンク一覧を確認する
- **THEN** framer-motion エンジン本体(`domMax`)を含むチャンクへの同期的な `<script>` 参照は含まれない(`LazyMotion` はルートレイアウトの `MotionProvider` にマウントされているため、`/login` を含む全ルートで同エンジンが非同期チャンクとして実行時にフェッチされる。これは意図した設計 (design.md Decision 1) であり、初回訪問後は Service Worker が `_next/static/chunks/*` を CacheFirst でプリキャッシュ済みのため低コスト)

#### Scenario: モーダル・リストのアニメーション挙動は変更前と同じ
- **WHEN** `/stock-items` でモーダルの開閉(スクリムのフェード、デスクトップでのスケールイン、モバイルでの下スワイプ閉じる)、およびフィルタ操作によるカードの `popLayout` 差し替えを行う
- **THEN** 変更前と同じ見た目・挙動でアニメーションする

#### Scenario: `ConfirmDialog` が他モーダルと同様に遅延ロードされる
- **WHEN** `StockItemsClient.tsx` のソースを確認する
- **THEN** `ConfirmDialog` の import が `CreateItemModal`/`EditItemModal`/`ImageSelectionModal`/`UrlRegistrationModal` と同じ `dynamic(..., { ssr: false })` 形式になっている

