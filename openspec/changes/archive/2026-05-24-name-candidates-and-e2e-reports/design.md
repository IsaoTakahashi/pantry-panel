## Context

### 現在の構成

**バックエンド**:
- `DefaultExtractor.extractWithProgress` が1st Claude コールで name を取得した後、`utf8.RuneCountInString(name) >= 25` のとき Jina を呼んで shorter name を上書きしている（精度が低い）
- Jina は fetch fallback（直接取得失敗時）とimage fallback（画像が見つからない時）にも使われており、今回は name 短縮用途のみ廃止する
- `Result` struct は `{ Name, ImageURL }` のみ保持

**フロントエンド**:
- `extractFromUrlStream` の done event で `onExtracted(name, imageUrl, sourceUrl)` が即時呼ばれる
- `UrlRegistrationModal` は `"idle" | "streaming" | "error"` の 3 state しかない

**CI**:
- `e2e.yml`: mock テストのみ、Playwright レポート未保存
- `e2e-preview.yml`: preview テストのみ、Playwright レポート未保存

## Goals / Non-Goals

**Goals:**
- name >= 25 文字のとき Claude 2nd コールで短縮候補 3 件を生成し、ユーザーが選択できるようにする
- `UrlRegistrationModal` に `nameSelection` ステップを追加して候補選択 UI を表示する
- `e2e.yml` / `e2e-preview.yml` の両方で Playwright HTML レポートを GHA アーティファクトとして保存する

**Non-Goals:**
- Jina fetch fallback・image fallback の廃止（name 短縮用途のみ削除）
- DB への name candidates 保存
- 候補数の 3 件以上への拡張
- 非同期 API (`/api/extract-from-url` non-stream) のレスポンス変更（stream エンドポイントのみ対応）

## Decisions

### 1. ClaudeExtractor に `GenerateCandidates` メソッドを追加

`ClaudeExtractor` に `GenerateCandidates(ctx, name) ([]string, error)` を追加し、専用プロンプトで短縮候補 JSON 配列を返す。  
**理由**: 既存の `Extract` とは責務が異なる。独立したメソッドにすることでテストが書きやすく、プロンプト調整も独立して行える。

### 2. `Result` struct に `NameCandidates []string` を追加

`Result.NameCandidates` を追加し、`extractWithProgress` が Jina 短縮の代わりに Claude candidates を格納して返す。  
**理由**: 既存の呼び出し側 (handler, stream handler) は `Result` を受け取るだけなので、シグネチャ変更なしに candidates を伝播できる。

### 3. done event に `nameCandidates?: string[]` を追加

SSE `event: done` の data に `nameCandidates` フィールドを追加（空のときは省略）。  
**理由**: フロントエンドが SSE から candidates を受け取るのが最も自然。non-stream エンドポイントは今回スコープ外（将来必要であれば同じ `Result` 構造から追加できる）。

### 4. `ModalState` に `"nameSelection"` を追加

done event で `nameCandidates` があるとき、`onExtracted` 呼び出しを遅延させ、modal 内で選択 UI を表示する。  
**理由**: 新しいモーダルコンポーネントを作るより、既存の `UrlRegistrationModal` 内で state 遷移させるほうがシンプル。選択後に `onExtracted(selectedName, imageUrl, sourceUrl)` を呼ぶ。

### 5. GHA に `if: always()` + `upload-artifact`

`e2e.yml` と `e2e-preview.yml` の両方に `actions/upload-artifact` を追加（`if: always()`）。  
mock と preview でアーティファクト名を分ける（例: `playwright-report-mock`, `playwright-report-preview`）。  
**理由**: テスト失敗時もレポートを保存したいため `if: always()` が必須。

## Risks / Trade-offs

- **2nd Claude コール失敗**: `GenerateCandidates` が error または不正 JSON を返した場合、candidates なし（empty slice）で done event を送る。ユーザーは元の name をそのまま使う。
- **候補が 15 文字制限を守らない可能性**: プロンプトで制約するが LLM は 100% 従わない。UI では候補をそのまま表示し、ユーザーが判断する。
- **Playwright HTML reporter 設定**: `playwright.config.ts` に `reporter: 'html'` が設定されていない場合、`playwright-report/` が生成されない。実装前に確認が必要。
- **e2e-preview.yml の実行権限**: `actions/upload-artifact` は `deployment_status` イベントでは `id-token: write` 不要だが、`permissions` ブロックに `contents: read` を追加する必要がある可能性がある。
