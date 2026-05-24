## Context

`POST /api/extract-from-url` runs up to 4 sequential steps inside `DefaultExtractor.Extract` and takes 15–20 s on slow pages. The UI currently blocks with a spinner and the user has no visibility into progress. This design adds a parallel SSE endpoint that pushes step events as they complete.

Current key files:
- `backend/urlextract/extractor.go` — `DefaultExtractor.Extract` (single-pass, no progress hooks)
- `backend/handler/url_extract.go` — `UrlExtractHandler.Extract` (wraps extractor, returns JSON)
- `frontend/src/components/UrlRegistrationModal.tsx` — spinner + `extractFromUrl()` call
- `frontend/src/lib/api.ts` — `extractFromUrl()` (fetch → JSON)

Lambda Function URL streaming is already enabled; no infra change is needed.

## Goals / Non-Goals

**Goals:**
- Add `POST /api/extract-from-url/stream` that streams SSE progress frames and a final `done`/`error` event
- Replace the static "解析中..." spinner in `UrlRegistrationModal` with a live step list
- Keep `POST /api/extract-from-url` (non-streaming) unchanged

**Non-Goals:**
- Exposing multiple name candidates for user selection (the extractor already picks the best name internally; candidates UI is a separate future change)
- Changing the existing non-streaming endpoint or its response schema
- Rewriting the extractor's internal step logic (add thin progress hooks only)

## Decisions

### 1. Progress callback via function parameter (not interface change)

`Extractor` interface stays as-is (`Extract(ctx, url) (Result, error)`). A new unexported helper `extractWithProgress(ctx, url, onProgress func(step, message string)) (Result, error)` is added to `DefaultExtractor`. The existing `Extract` calls it with a no-op callback. The SSE handler calls it with a function that writes SSE frames.

**Alternatives considered:**
- New `ProgressExtractor` interface — cleaner DI, but adds a second interface; overkill when only the SSE handler needs it.
- Channel instead of callback — fits Go style but requires goroutine management and complicates the handler.
- Context values — anti-pattern for callbacks; hard to test.

### 2. SSE handler in a new file, registered separately

`handler/url_extract_stream.go` adds `UrlExtractHandler.ExtractStream(c *echo.Context) error`. Registered in `main.go` alongside the existing route. This keeps the non-streaming handler file clean.

SSE frame format (text/event-stream):
```
event: progress
data: {"step":"fetching","message":"ページを取得中..."}

event: progress
data: {"step":"extracting","message":"商品情報を解析中..."}

event: done
data: {"name":"...","imageUrl":"..."}
```

Error frame:
```
event: error
data: {"kind":"fetchFailed","message":"...","detail":"..."}
```

Step identifiers: `fetching`, `fetching_jina`, `extracting`, `generating_candidates`.  
`fetching_jina` emits only when Jina fallback is triggered. `generating_candidates` emits only when the name is ≥ 25 runes.

### 3. Frontend uses fetch + ReadableStream (no EventSource)

`EventSource` only supports GET. The endpoint is `POST` (body contains the URL), so we use `fetch` + `response.body.getReader()` + manual SSE line parsing. A small inline helper (`parseSSELine`) handles the `event:` / `data:` fields. No new npm dependency needed.

**Alternative**: Switch to GET with URL-encoded parameter. Rejected — breaks REST conventions and leaks user URLs into server access logs.

### 4. Step list replaces spinner (same loading state slot)

`ModalState` gains a new variant `"streaming"`. During streaming, the UI renders an ordered step list replacing the spinner div. Each step shows:
- ✓ checkmark (text-green-600) — completed
- spinner (animate-spin border-[#00d1b2]) — active
- muted label (text-gray-400) — pending

On `event: done`, the modal transitions to success (calls `onExtracted`) as before. On `event: error`, it sets `state = "error"` with the same `ExtractFromUrlError` as the non-streaming path.

### 5. nameCandidates omitted from done event

The wishlist spec included `nameCandidates` in `event: done`, but candidate selection UI is a separate future feature. The `done` payload is `{ name, imageUrl }`, matching the existing non-streaming response. This keeps `onExtracted` callback and `CreateItemModal` unchanged.

## Risks / Trade-offs

- **Lambda streaming cold start** — First request after idle may delay the first SSE frame by 1–3 s before the progress list appears. Mitigation: existing warmup scheduler already pings `/health` every 5 min.
- **ReadableStream browser support** — `response.body` streaming is supported in all modern browsers (Chrome 43+, Firefox 65+, Safari 14.1+). IE is not supported (already not a target).
- **SSE over HTTP/1.1 connection limit** — browsers allow 6 connections per origin; each SSE stream holds one. Since the modal is modal (exclusive), at most 1 stream is open at a time. Not a concern.
- **Partial frame on Lambda timeout** — If the 30 s Lambda timeout fires mid-stream, the client ReadableStream ends without a `done` event. Frontend should treat a closed stream with no `done` as a network error.

## Migration Plan

1. Backend: add progress hooks to extractor → new SSE handler → route registration → tests
2. Frontend: add streaming fetch helper → update `UrlRegistrationModal` → tests
3. Deploy: backend auto-deploys on merge to main; frontend deploys via Vercel on merge
4. Rollback: non-streaming endpoint is unchanged; frontend can revert to `extractFromUrl()` by reverting the modal component
