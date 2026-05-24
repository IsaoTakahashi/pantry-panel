## 0. Infrastructure: Lambda Streaming Mode

- [x] 0.1 Update Lambda Function URL `InvokeMode` to `RESPONSE_STREAM` (`aws lambda update-function-url-config --function-name pantry-panel-backend --invoke-mode RESPONSE_STREAM`)
- [x] 0.2 Add `AWS_LWA_INVOKE_MODE=response_stream` to Lambda environment variables (`aws lambda update-function-configuration --function-name pantry-panel-backend --environment ...`)
- [x] 0.3 Verify Function URL config with `aws lambda get-function-url-config --function-name pantry-panel-backend --query InvokeMode`

## 1. Issue & Branch Setup

- [x] 1.1 Create GitHub Issue for "改善4: 抽出処理の途中経過表示"
- [x] 1.2 Create feature branch `{issue番号}-extraction-progress-sse`

## 2. Backend: Extractor Progress Hooks

- [x] 2.1 Define `ProgressFunc` type (`func(step, message string)`) in `urlextract` package
- [x] 2.2 Add internal `extractWithProgress(ctx, url, onProgress ProgressFunc) (Result, error)` to `DefaultExtractor` — factor out progress calls from existing `Extract` logic
- [x] 2.3 Update `DefaultExtractor.Extract` to call `extractWithProgress` with a no-op callback (keeps interface unchanged)
- [x] 2.4 Write Backend Unit tests for progress callback: verify `fetching`, `extracting` steps are reported on success path
- [x] 2.5 Write Backend Unit tests: verify `fetching_jina` is reported when step1 fetch fails
- [x] 2.6 Write Backend Unit tests: verify `generating_candidates` is reported when extracted name is ≥ 25 runes

## 3. Backend: SSE Handler

- [x] 3.1 Create `handler/url_extract_stream.go` with `UrlExtractStreamHandler` struct holding `*urlextract.DefaultExtractor`
- [x] 3.2 Implement `ExtractStream(c *echo.Context) error`: validate URL, set `Content-Type: text/event-stream`, write progress frames via `onProgress`, write `event: done` or `event: error` at completion, flush after each frame
- [x] 3.3 Add SSE frame helpers: `writeProgressEvent`, `writeDoneEvent`, `writeErrorEvent` (pure functions, easy to test)
- [x] 3.4 Register route `POST /api/extract-from-url/stream` in `main.go`
- [x] 3.5 Write Backend Unit tests for `ExtractStream`: normal path (progress → done), error path (error event emitted, done not emitted), empty URL (400 before streaming)
- [x] 3.6 Verify `go test ./...` passes locally

## 4. Frontend: SSE Client Helper

- [x] 4.1 Define `ExtractionProgressEvent` and `ExtractionDoneEvent` and `ExtractionErrorEvent` types in `lib/api.ts`
- [x] 4.2 Implement `extractFromUrlStream(url, onProgress, onDone, onError, accessToken?, activeGroupId?)` in `lib/api.ts` using `fetch` + `ReadableStream` + SSE line parser
- [x] 4.3 Write Frontend Unit tests for `extractFromUrlStream`: verify `onProgress` called for each progress frame, `onDone` called on done, `onError` called on error

## 5. Frontend: UrlRegistrationModal Progress UI

- [x] 5.1 Add `"streaming"` to `ModalState` type in `UrlRegistrationModal.tsx`
- [x] 5.2 Add step list state: `ExtractionStep[]` where each step has `{ id, label, status: 'done' | 'active' | 'pending' }`
- [x] 5.3 Replace spinner block with step list component (✓ done / spinner active / muted pending), shown when `state === "streaming"`
- [x] 5.4 Update `submit()` to call `extractFromUrlStream` instead of `extractFromUrl`, updating step states as progress events arrive
- [x] 5.5 Handle `event: done` → call `onExtracted` (same as before)
- [x] 5.6 Handle `event: error` → map to `ExtractFromUrlError` and set `state = "error"` (same error UI as before)
- [x] 5.7 Write Frontend Unit tests: step list renders correct status classes for done/active/pending
- [x] 5.8 Write Frontend Integration tests: `event: error` response renders error message correctly
- [x] 5.9 Update E2E Mock test in `url-registration.spec.ts`: stub SSE route, verify step list appears, verify transition to CreateItemModal on done
- [x] 5.10 Run `npm run dev` and manually verify the full flow in browser (URL submit → steps → modal transition)

## 6. CI Verification

- [ ] 6.1 Commit and push; confirm GitHub Actions CI passes (`gh pr checks --watch`)
- [ ] 6.2 Run `opsx:archive` on the feature branch before merging PR
