## MODIFIED Requirements

### Requirement: Page fetch failure
The system SHALL return 502 with a JSON body containing `message` and `detail` when the target page is unreachable.

#### Scenario: Page fetch failure response includes detail
- **WHEN** the target page is unreachable (timeout, DNS error, connection refused, Jina also fails)
- **THEN** the API returns 502 with `{ "message": "failed to fetch the target page", "detail": "<technical reason>" }`
- **AND** `detail` SHALL include which step failed (step1 / Jina) and the underlying error string (e.g., HTTP status, connection error)

### Requirement: Extraction failure (name cannot be determined)
The system SHALL return 422 with a JSON body containing `message` and `detail` when no product name can be extracted.

#### Scenario: Extraction failure response includes detail
- **WHEN** the page is fetched successfully but no product name can be extracted by any method
- **THEN** the API returns 422 with `{ "message": "could not extract product name from page", "detail": "<technical reason>" }`
- **AND** `detail` SHALL describe why extraction failed (e.g., "Claude returned empty name", "JSON unmarshal error")

### Requirement: Extraction success transitions to confirm modal
The system SHALL pass the source URL to the `CreateItemModal` when extraction succeeds, so it can be stored on item creation.

#### Scenario: Extraction success carries source URL
- **WHEN** extraction succeeds and `onExtracted` is called
- **THEN** `UrlRegistrationModal` passes `name`, `imageUrl`, and `sourceUrl` (the submitted URL) to the callback
- **AND** `CreateItemModal` receives `initialSourceUrl` and includes it in the create request

## ADDED Requirements

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
