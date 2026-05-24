## REMOVED Requirements

### Requirement: Jina-based name shortening
**Reason**: Jina の名前短縮は精度が低い。Claude による候補生成に置き換える。
**Migration**: 名前が 25 文字以上の場合は Claude 2nd コールで短縮候補を生成する（`nameCandidates` フィールド参照）。Jina は fetch fallback および image fallback としての用途のみ継続。

## ADDED Requirements

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
