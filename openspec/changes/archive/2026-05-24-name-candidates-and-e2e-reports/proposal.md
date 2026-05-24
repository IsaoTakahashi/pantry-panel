## Why

URL から商品登録する際、25 文字以上の商品名を Jina で短縮しようとしているが精度が低く、ユーザーに不正確な名前が提案される。代わりに Claude に短縮候補を複数生成させ、ユーザーが選べる UI に変更する。また、E2E テスト失敗時に Playwright レポートが GHA 上に残らないため、Flakiness の調査に手間がかかっている。

## What Changes

- **バックエンド**: `extractor.go` から Jina 経由の名前短縮ロジックを削除。代わりに抽出名が 25 文字以上のとき 2nd Claude コールで短縮候補 3 つを生成し、API レスポンスに `nameCandidates: string[]` を追加する（短い場合はフィールド省略）
- **バックエンド**: `POST /api/extract-from-url` と `POST /api/extract-from-url/stream` の両方で `nameCandidates` を返す
- **フロントエンド**: `UrlRegistrationModal` に `nameSelection` ステップを追加。`nameCandidates` が返ってきたとき、3 候補 ＋ 元の名前から 1 つを選択させる UI を表示する
- **フロントエンド**: `UrlRegistrationModal` の「name ≥ 25 文字のとき step2 に移行」という条件分岐を削除（候補選択が同じ役割を担う）
- **CI**: `e2e.yml` の Mock・Preview テストジョブに `actions/upload-artifact` を追加し、Playwright レポートを GHA アーティファクトとして保存・ダウンロード可能にする

## Capabilities

### New Capabilities

- `name-candidates-selection`: URL 抽出後に長い商品名の短縮候補をユーザーが選択するフロー

### Modified Capabilities

- `url-product-extraction`: API レスポンスに `nameCandidates?: string[]` フィールドを追加。Jina 名前短縮は廃止
- `extraction-progress-streaming`: SSE `event: done` のデータスキーマに `nameCandidates?: string[]` を追加

## Impact

- `backend/internal/extractor/extractor.go`: Jina 短縮ロジック削除、2nd Claude コール追加
- `backend/internal/extractor/extractor_test.go`: 関連テスト更新
- `frontend/src/components/UrlRegistrationModal.tsx`: nameSelection ステップ追加、step 条件削除
- `frontend/src/components/UrlRegistrationModal.test.tsx`: 関連テスト追加
- `.github/workflows/e2e.yml`: upload-artifact ステップ追加
