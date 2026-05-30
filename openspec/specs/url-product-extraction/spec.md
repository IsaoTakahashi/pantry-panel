### Requirement: Extract product info from URL
The system SHALL accept a Web page URL and extract product name and image URL via `POST /api/extract-from-url`.

#### Scenario: Successful extraction via og:title / og:image
- **WHEN** a valid URL is submitted and the page has `og:title` and `og:image` meta tags
- **THEN** the API returns 200 with `{ "name": "<og:title value>", "imageUrl": "<og:image value>" }`

#### Scenario: Successful extraction via schema.org Product
- **WHEN** a valid URL is submitted, og tags are absent, and the page has `schema.org/Product` markup
- **THEN** the API returns 200 with name and imageUrl extracted from the structured data

#### Scenario: Successful extraction via Claude Haiku fallback
- **WHEN** a valid URL is submitted, meta tags and schema.org are absent, and ANTHROPIC_API_KEY is set
- **THEN** the system sends the page HTML text (up to ~8000 chars) to Claude Haiku
- **AND** the API returns 200 with name (and optionally imageUrl) extracted by the model

#### Scenario: Extraction succeeds with name only (no image)
- **WHEN** a valid URL is submitted and name can be extracted but no image URL is found
- **THEN** the API returns 200 with `{ "name": "<extracted name>", "imageUrl": null }`

#### Scenario: Invalid URL format
- **WHEN** the request body contains an empty or malformed URL
- **THEN** the API returns 400 with an error message

#### Scenario: Page fetch failure
- **WHEN** the target page is unreachable (timeout, DNS error, connection refused, Jina also fails)
- **THEN** the API returns 502 with `{ "message": "failed to fetch the target page", "detail": "<technical reason>" }`
- **AND** `detail` SHALL include which step failed (step1 / Jina) and the underlying error string (e.g., HTTP status, connection error)

#### Scenario: Extraction failure (name cannot be determined)
- **WHEN** the page is fetched successfully but no product name can be extracted by any method
- **THEN** the API returns 422 with `{ "message": "could not extract product name from page", "detail": "<technical reason>" }`
- **AND** `detail` SHALL describe why extraction failed (e.g., "Claude returned empty name", "JSON unmarshal error")

#### Scenario: ANTHROPIC_API_KEY not configured
- **WHEN** ANTHROPIC_API_KEY environment variable is not set
- **THEN** the system skips the Claude fallback
- **AND** if meta tags yield a name, returns 200 normally
- **AND** if meta tags yield no name, returns 422 (same as extraction failure)
- **AND** all other API endpoints continue to function normally

### Requirement: URL registration entry point in UI
The system SHALL provide a link icon button adjacent to the "商品を追加" button in the stock items header.
When the button is tapped, the system SHALL attempt to read the clipboard and auto-fill / auto-submit if a valid URL is found.

#### Scenario: Open URL modal — clipboard has valid URL
- **WHEN** the user taps the link icon button
- **AND** the clipboard contains a string that is a valid HTTP/HTTPS URL
- **THEN** `UrlRegistrationModal` opens with the URL pre-filled in the input field
- **AND** extraction starts automatically (equivalent to the user pressing "抽出")

#### Scenario: Open URL modal — clipboard has non-URL text
- **WHEN** the user taps the link icon button
- **AND** the clipboard contains a non-empty string that is NOT a valid HTTP/HTTPS URL
- **THEN** `UrlRegistrationModal` opens with an empty input field
- **AND** a notice "URLの読み取りに失敗しました" is displayed
- **AND** the notice includes the clipboard text (truncated to 60 characters if longer)

#### Scenario: Open URL modal — clipboard read fails
- **WHEN** the user taps the link icon button
- **AND** reading the clipboard raises an error (permission denied, API unavailable, etc.)
- **THEN** `UrlRegistrationModal` opens with an empty input field
- **AND** a notice "URLの読み取りに失敗しました" is displayed (without clipboard text)

#### Scenario: Open URL modal — clipboard is empty
- **WHEN** the user taps the link icon button
- **AND** the clipboard is empty
- **THEN** `UrlRegistrationModal` opens with an empty input field and no notice

#### Scenario: Open URL modal — clipboard API unavailable
- **WHEN** the user taps the link icon button
- **AND** `navigator.clipboard.readText` is not available (e.g., non-HTTPS context)
- **THEN** `UrlRegistrationModal` opens with an empty input field and no notice

#### Scenario: Clipboard notice dismissed on user input
- **WHEN** a clipboard notice is displayed
- **AND** the user types into the URL input field
- **THEN** the notice is dismissed

#### Scenario: Step-by-step progress during extraction
- **WHEN** the user submits a URL (manually or via auto-submit from clipboard)
- **THEN** the modal shows an ordered list of extraction steps: "ページを取得中..." → "商品情報を解析中..."
- **AND** each completed step is marked with a checkmark (✓)
- **AND** the currently active step shows a spinner
- **AND** pending steps are shown in a muted style
- **AND** the submit button is disabled during extraction

#### Scenario: Jina fallback step shown when triggered
- **WHEN** direct fetch fails and Jina fallback is triggered
- **THEN** an additional step "別の方法でページを取得中..." appears and becomes active after "ページを取得中..."

#### Scenario: Name-candidate step shown when triggered
- **WHEN** the SSE stream emits step `generating_candidates`
- **THEN** the step "名前の候補を生成中..." appears and becomes active

#### Scenario: Extraction success transitions to confirm modal
- **WHEN** extraction succeeds
- **THEN** `UrlRegistrationModal` closes
- **AND** `CreateItemModal` opens with `initialName`, `initialImageUrl`, and `initialSourceUrl` pre-filled from the extraction result
- **AND** the user can edit name, category, and image before saving

#### Scenario: Extraction failure (422) offers manual entry
- **WHEN** the API returns an error with kind `extractionFailed`
- **THEN** the modal shows "商品情報を取得できませんでした。手動で入力してください"
- **AND** a button to open the empty `CreateItemModal` is shown

#### Scenario: Page fetch failure shown as error
- **WHEN** the API returns an error with kind `fetchFailed`
- **THEN** the modal shows "ページを取得できませんでした" and allows retry

#### Scenario: Invalid URL shown as validation error
- **WHEN** the API returns HTTP 400
- **THEN** the modal shows "有効な URL を入力してください"

### Requirement: Extraction success carries source URL
The system SHALL pass the source URL to the `CreateItemModal` when extraction succeeds, so it can be stored on item creation.

#### Scenario: Extraction success carries source URL
- **WHEN** extraction succeeds and `onExtracted` is called
- **THEN** `UrlRegistrationModal` passes `name`, `imageUrl`, and `sourceUrl` (the submitted URL) to the callback
- **AND** `CreateItemModal` receives `initialSourceUrl` and includes it in the create request

### Requirement: Error detail disclosed to user
The system SHALL display a collapsible "詳細を表示" section in `UrlRegistrationModal` when an error response includes a `detail` field.

#### Scenario: Detail toggle hidden by default
- **WHEN** an extraction error is shown
- **AND** the response body contains a non-empty `detail` field
- **THEN** a "詳細を表示" button is rendered below the error message
- **AND** the detail text is NOT visible initially

#### Scenario: Detail toggle reveals technical info
- **WHEN** the user clicks "詳細を表示"
- **THEN** the `detail` string is shown in a monospace/pre-formatted block
- **AND** the button label changes to "詳細を隠す"

#### Scenario: No detail toggle when detail is absent
- **WHEN** an extraction error is shown
- **AND** the response body has no `detail` field (or it is empty)
- **THEN** no "詳細を表示" button is rendered

### Requirement: Return name candidates for long product names
The system SHALL generate up to 3 shortened name candidates via a second Claude call when the extracted name is 25 or more Unicode characters, and include them in the API response as `nameCandidates: string[]`.

#### Scenario: Candidates generated for long name via POST /api/extract-from-url
- **WHEN** `POST /api/extract-from-url` succeeds and the extracted name has 25+ Unicode characters
- **THEN** the response body includes `"nameCandidates": ["候補1", "候補2", "候補3"]` alongside `"name"` and `"imageUrl"`
- **AND** each candidate SHALL be 15 or fewer Unicode characters

#### Scenario: No candidates for short name
- **WHEN** `POST /api/extract-from-url` succeeds and the extracted name is fewer than 25 Unicode characters
- **THEN** the response body does NOT include a `nameCandidates` field

#### Scenario: Candidates omitted when Claude call fails
- **WHEN** the Claude candidates call fails (network error, API error, or invalid JSON response)
- **THEN** the API returns 200 with `name` and `imageUrl` as normal
- **AND** `nameCandidates` is omitted from the response (graceful degradation)
