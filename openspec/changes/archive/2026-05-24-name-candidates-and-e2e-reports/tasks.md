## 1. バックエンド: Result 型と候補生成ロジック

- [x] 1.1 `Result` struct に `NameCandidates []string` フィールドを追加する (`urlextract/extractor.go`)
- [x] 1.2 `ClaudeExtractor` に `GenerateCandidates(ctx, name string) ([]string, error)` メソッドを追加する（専用プロンプト、JSON 配列を返す）
- [x] 1.3 `extractWithProgress` の Jina 名前短縮ブロック（`needShorterName` 判定）を削除し、代わりに name >= 25 文字のとき `GenerateCandidates` を呼んで `Result.NameCandidates` にセットする
- [x] 1.4 `GenerateCandidates` の単体テストを追加する（正常系: 候補 3 件返却、エラー系: API 失敗時は empty slice）
- [x] 1.5 `extractWithProgress` の統合テストを更新する（Jina 短縮の削除・candidates 生成のモック）

## 2. バックエンド: ハンドラーと SSE レスポンス

- [x] 2.1 `POST /api/extract-from-url` ハンドラーのレスポンス型に `NameCandidates []string` を追加し、`Result.NameCandidates` をマッピングする（空のときはフィールドを省略: `omitempty`）
- [x] 2.2 `POST /api/extract-from-url/stream` ハンドラーの done event データ型に `NameCandidates []string` を追加し、`Result.NameCandidates` をマッピングする（`omitempty`）
- [x] 2.3 ハンドラーの単体テスト・統合テストを更新する（candidates あり・なし両方）

## 3. フロントエンド: API 型と候補選択 UI

- [x] 3.1 `ExtractionDoneEvent` 型に `nameCandidates?: string[]` を追加する (`frontend/src/lib/api.ts`)
- [x] 3.2 `UrlRegistrationModal` の `ModalState` に `"nameSelection"` を追加し、done event で `nameCandidates` があるとき `onExtracted` を遅延させて `nameSelection` 状態に遷移させる
- [x] 3.3 `nameSelection` 状態時の候補選択 UI を実装する（候補ボタン一覧 ＋ 元の名前ボタン、選択後に `onExtracted(selected, imageUrl, sourceUrl)` を呼ぶ）
- [x] 3.4 `nameSelection` 状態でキャンセルボタンが機能することを確認する（`onClose` 呼び出し）
- [x] 3.5 `UrlRegistrationModal` のテストを追加・更新する（candidates あり: selection UI 表示、candidates なし: 従来フロー）

## 4. CI: Playwright レポートの GHA 保存

- [x] 4.1 `playwright.config.ts` に `reporter: [['list'], ['html']]` を追加して CI でも HTML レポートが生成されるようにする
- [x] 4.2 `e2e.yml` の mock テストジョブに `if: always()` 付きで `actions/upload-artifact` ステップを追加する（アーティファクト名: `playwright-report-mock`、パス: `frontend/playwright-report`）
- [x] 4.3 `e2e-preview.yml` の preview テストジョブに `if: always()` 付きで `actions/upload-artifact` ステップを追加する（アーティファクト名: `playwright-report-preview`、パス: `frontend/playwright-report`）
