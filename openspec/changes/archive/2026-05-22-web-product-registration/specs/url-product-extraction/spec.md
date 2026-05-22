## ADDED Requirements

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
- **WHEN** the target page is unreachable (timeout, DNS error, connection refused)
- **THEN** the API returns 502 with an error message
- **AND** the timeout for the HTTP fetch SHALL be 10 seconds

#### Scenario: Extraction failure (name cannot be determined)
- **WHEN** the page is fetched successfully but no product name can be extracted by any method
- **THEN** the API returns 422 with an error message

#### Scenario: ANTHROPIC_API_KEY not configured
- **WHEN** ANTHROPIC_API_KEY environment variable is not set
- **THEN** the system skips the Claude fallback
- **AND** if meta tags yield a name, returns 200 normally
- **AND** if meta tags yield no name, returns 422 (same as extraction failure)
- **AND** all other API endpoints continue to function normally

### Requirement: URL registration entry point in UI
The system SHALL provide a link icon button adjacent to the "商品を追加" button in the stock items header.

#### Scenario: Open URL modal
- **WHEN** the user taps the link icon button
- **THEN** `UrlRegistrationModal` opens with a URL input field

#### Scenario: Loading state during extraction
- **WHEN** the user submits a URL
- **THEN** the modal shows a loading spinner and disables the submit button

#### Scenario: Extraction success transitions to confirm modal
- **WHEN** extraction succeeds
- **THEN** `UrlRegistrationModal` closes
- **AND** `CreateItemModal` opens with `initialName` and `initialImageUrl` pre-filled from the extraction result
- **AND** the user can edit name, category, and image before saving

#### Scenario: Extraction failure (422) offers manual entry
- **WHEN** the API returns 422
- **THEN** the modal shows "商品情報を取得できませんでした。手動で入力してください"
- **AND** a button to open the empty `CreateItemModal` is shown

#### Scenario: Page fetch failure (502) shown as error
- **WHEN** the API returns 502
- **THEN** the modal shows "ページを取得できませんでした" and allows retry

#### Scenario: Invalid URL (400) shown as validation error
- **WHEN** the API returns 400
- **THEN** the modal shows "有効な URL を入力してください"
