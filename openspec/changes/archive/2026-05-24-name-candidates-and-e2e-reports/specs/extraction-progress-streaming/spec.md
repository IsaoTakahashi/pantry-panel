## MODIFIED Requirements

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
