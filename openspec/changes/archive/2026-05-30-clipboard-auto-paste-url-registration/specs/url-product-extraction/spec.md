## MODIFIED Requirements

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
