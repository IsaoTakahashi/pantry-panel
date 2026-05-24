## Why

`POST /api/extract-from-url` involves up to 4 sequential steps (direct fetch → Jina fallback → Claude name extraction → candidate name generation) and can take 15–20 seconds, yet the UI shows only a static "解析中..." spinner with no indication of what is happening or how long remains. Adding step-by-step progress via SSE removes the perception of a hung UI and gives users confidence the operation is proceeding.

## What Changes

- **Backend**: Add new endpoint `POST /api/extract-from-url/stream` that streams progress events via SSE. Each step emits an `event: progress` frame; the final result is emitted as `event: done` (or `event: error` on failure). The existing `POST /api/extract-from-url` is kept unchanged for backward compatibility.
  - Progress steps: `fetching` → `fetching_jina` (fallback only) → `extracting` → `generating_candidates` (long-name only)
- **Frontend**: `UrlRegistrationModal` switches from a single "解析中..." spinner to an ordered step list. Each step shows a checkmark (完了), spinner (進行中), or muted label (未着手). Internally uses `fetch` + `ReadableStream` to consume SSE (EventSource is POST-incompatible).

## Capabilities

### New Capabilities

- `extraction-progress-streaming`: SSE endpoint `POST /api/extract-from-url/stream` — event protocol, step identifiers, error event schema, and streaming response contract.

### Modified Capabilities

- `url-product-extraction`: "Loading state during extraction" scenario changes — spinner replaced by step-progress list; adds E2E Mock scenario for visible steps during streaming. New API endpoint is additive (does not break existing scenarios).

## Impact

- **Backend**: `urlextract` package — `DefaultExtractor.Extract` gains a progress-callback parameter (or channel) to emit step events. New `handler/url_extract_stream.go` SSE handler. `main.go` route registration.
- **Frontend**: `UrlRegistrationModal.tsx` — SSE client loop, step state, progress list UI. `lib/api.ts` — streaming fetch helper (or inline).
- **Lambda**: Lambda Function URL streaming responses are already supported; no infra change needed.
- **Tests**: Backend Unit for SSE handler + extractor progress callbacks; Frontend Unit for step list rendering; E2E Mock for full flow with visible steps.

## ユーザーシナリオとテスト設計

### フロントエンドシナリオ

#### サマリ
| # | シナリオ | 環境 | スコープ |
|---|---------|------|---------|
| S-1 | URL 送信後に進捗ステップリストが表示される | Mock | E2E |
| S-2 | 各ステップが完了・進行中・未着手で視覚的に区別される | - | Frontend Unit |
| S-3 | Jina フォールバック時に追加ステップが現れる | - | Frontend Unit |
| S-4 | SSE stream が `done` を受け取ると CreateItemModal に遷移する | Mock | E2E |
| S-5 | SSE stream が `error` を受け取るとエラーメッセージが表示される | - | Frontend Integration |

#### S-1: URL 送信後に進捗ステップリストが表示される
**Given:** UrlRegistrationModal が開いている  
**When:** ユーザーが URL を入力してフォームを送信する  
**Then:** スピナーの代わりにステップリスト（ページを取得中..., 商品情報を解析中...）が表示される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | SSE ストリーム開始後にステップリストが DOM に現れること | route handler で SSE レスポンスを stub |
| Frontend Unit | `state === "streaming"` 時にステップリストが描画されること | — |

**E2E判定:** Yes  
**理由:** ブラウザの ReadableStream API と実際の DOM 更新を確認するため E2E が必要

---

#### S-2: 各ステップが完了・進行中・未着手で視覚的に区別される
**Given:** 抽出処理が進行中  
**When:** progress イベントが順に届く  
**Then:** 完了ステップ(✓), 進行中ステップ(spinner), 未着手ステップ(muted) が正しく表示される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | 各 step status に応じた CSS クラス/要素が描画されること | — |

**E2E判定:** No  
**理由:** props/state の検証で DOM 確認が代替できる

---

#### S-3: Jina フォールバック時に追加ステップが現れる
**Given:** 抽出処理が `fetching` ステップ完了後  
**When:** `step: fetching_jina` の progress イベントが届く  
**Then:** "別の方法でページを取得中..." ステップが進行中スピナーで表示される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Unit | `fetching_jina` イベント受信時に該当ステップが active になること | — |

**E2E判定:** No  
**理由:** Unit でイベント受信と state 変化を検証できる

---

#### S-4: SSE stream が `done` を受け取ると CreateItemModal に遷移する
**Given:** SSE ストリームが進行中  
**When:** `event: done` を受け取る  
**Then:** UrlRegistrationModal が閉じ、CreateItemModal が name・imageUrl 付きで開く

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| E2E Mock | モーダル遷移と pre-fill が正しいこと | 既存 E2E シナリオをストリーミングパスで再確認 |

**E2E判定:** Yes  
**理由:** モーダル間の遷移はブラウザ DOM 確認が必要

---

#### S-5: SSE stream が `error` を受け取るとエラーメッセージが表示される
**Given:** SSE ストリームが進行中  
**When:** `event: error` (kind: fetchFailed) を受け取る  
**Then:** "ページを取得できませんでした" と再試行ボタンが表示される

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Frontend Integration | error イベントでエラー UI に切り替わること | fetch mock で SSE error 応答を返す |

**E2E判定:** No  
**理由:** API レスポンス形式が固定で mock 再現可能のため Integration で十分

---

### バックエンドシナリオ

#### サマリ
| # | シナリオ | スコープ |
|---|---------|---------|
| B-1 | 正常パスで progress → done イベントが配信される | Backend Unit |
| B-2 | Jina フォールバック時に fetching_jina イベントが配信される | Backend Unit |
| B-3 | 抽出エラー時に error イベントが配信される | Backend Unit |
| B-4 | URL 未入力で 400 が返る | Backend Unit |

#### B-1: 正常パスで progress → done イベントが配信される
**Given:** モック extractor が progress callback 経由でステップを報告し、最終結果を返す  
**When:** `POST /api/extract-from-url/stream` に `{"url": "https://example.com/product"}` を送信  
**Then:** レスポンスに `event: progress` × N + `event: done` が順番に含まれる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | SSE レスポンスボディに期待フレームが含まれること | httptest.ResponseRecorder で受信 |

#### B-2: Jina フォールバック時に fetching_jina イベントが配信される
**Given:** step1 fetch が失敗するようにモックされている  
**When:** `POST /api/extract-from-url/stream` を呼ぶ  
**Then:** `step: fetching_jina` の progress フレームが含まれる

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | fetching_jina フレームの有無 | — |

#### B-3: 抽出エラー時に error イベントが配信される
**Given:** extractor が ErrFetchFailed を返すようにモックされている  
**When:** `POST /api/extract-from-url/stream` を呼ぶ  
**Then:** `event: error` フレームが配信され `event: done` は配信されない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | error フレーム有、done フレーム無 | — |

#### B-4: URL 未入力で 400 が返る
**Given:** リクエストボディの url が空  
**When:** `POST /api/extract-from-url/stream` を呼ぶ  
**Then:** HTTP 400 が返り SSE ストリームは開かれない

| スコープ | 検証観点 | 備考 |
|---------|---------|------|
| Backend Unit | ステータスコード 400 | — |
