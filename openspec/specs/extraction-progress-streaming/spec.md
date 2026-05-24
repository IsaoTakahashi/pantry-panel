### Requirement: Stream extraction progress via SSE
The system SHALL expose `POST /api/extract-from-url/stream` that accepts the same request body as `POST /api/extract-from-url` and responds with a `text/event-stream` body. The endpoint SHALL emit `event: progress` frames as each extraction step begins, and finish with a single `event: done` (success) or `event: error` (failure) frame. The existing `POST /api/extract-from-url` endpoint SHALL remain unchanged.

#### Scenario: Progress events emitted in order (normal path)
- **WHEN** `POST /api/extract-from-url/stream` is called with a valid URL that succeeds via direct fetch
- **THEN** the response `Content-Type` is `text/event-stream`
- **AND** at minimum the frames `event: progress / step: fetching` and `event: progress / step: extracting` are emitted before `event: done`
- **AND** `event: done` data contains `{ "name": "<string>", "imageUrl": "<string|null>" }` matching the extraction result

#### Scenario: Jina fallback step emitted when direct fetch fails
- **WHEN** `POST /api/extract-from-url/stream` is called and the direct HTTP fetch fails (triggering Jina fallback)
- **THEN** an `event: progress` frame with `step: fetching_jina` is emitted after the `fetching` frame

#### Scenario: Name-candidate step emitted when extracted name is long
- **WHEN** the extracted name is 25 or more Unicode characters
- **THEN** an `event: progress` frame with `step: generating_candidates` is emitted before `event: done`

#### Scenario: Error event on fetch failure
- **WHEN** both direct fetch and Jina fallback fail
- **THEN** `event: error` is emitted with `{ "kind": "fetchFailed", "message": "...", "detail": "..." }`
- **AND** no `event: done` frame is emitted

#### Scenario: Error event on extraction failure
- **WHEN** the page is fetched but no product name can be extracted
- **THEN** `event: error` is emitted with `{ "kind": "extractionFailed", "message": "...", "detail": "..." }`

#### Scenario: Invalid URL returns 400 before streaming starts
- **WHEN** the request body contains an empty URL
- **THEN** the endpoint returns HTTP 400 with `{ "message": "url is required" }` (no SSE stream is opened)

### Requirement: SSE event frame schema
The system SHALL use the following SSE frame schemas.

#### Scenario: Progress frame schema is well-formed
- **WHEN** a progress frame is emitted
- **THEN** it has the format `event: progress\ndata: {"step":"<id>","message":"<ja-text>"}\n\n`
- **AND** `step` SHALL be one of: `fetching`, `fetching_jina`, `extracting`, `generating_candidates`

#### Scenario: Done frame schema is well-formed
- **WHEN** a done frame is emitted and the extracted name is fewer than 25 Unicode characters
- **THEN** it has the format `event: done\ndata: {"name":"<string>","imageUrl":"<string|null>"}\n\n`

#### Scenario: Done frame includes nameCandidates when name is long
- **WHEN** a done frame is emitted and the extracted name is 25 or more Unicode characters
- **AND** Claude successfully generates name candidates
- **THEN** the done frame data includes `"nameCandidates": ["<c1>","<c2>","<c3>"]` in addition to `name` and `imageUrl`
- **AND** each candidate SHALL be 15 or fewer Unicode characters

#### Scenario: Done frame omits nameCandidates when candidates call fails
- **WHEN** a done frame is emitted and the extracted name is 25+ characters
- **AND** the Claude candidates call fails
- **THEN** the done frame data contains only `name` and `imageUrl` (no `nameCandidates` field)

#### Scenario: Error frame schema is well-formed
- **WHEN** an error frame is emitted
- **THEN** it has the format `event: error\ndata: {"kind":"<kind>","message":"<string>","detail":"<string>"}\n\n`
- **AND** `kind` SHALL be one of: `fetchFailed`, `extractionFailed`, `unknown`
