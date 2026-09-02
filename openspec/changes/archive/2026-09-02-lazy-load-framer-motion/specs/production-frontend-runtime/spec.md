## ADDED Requirements

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
