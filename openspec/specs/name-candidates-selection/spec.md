# name-candidates-selection Specification

## Purpose
When the backend extracts a product name that is 25 or more Unicode characters long, the frontend presents a name candidate selection step, allowing the user to choose a shorter variant before creating the item.

## Requirements

### Requirement: Show name candidate selection UI when candidates are returned
The system SHALL display a name selection step in `UrlRegistrationModal` when the stream done event includes a non-empty `nameCandidates` array, allowing the user to choose one before proceeding to `CreateItemModal`.

#### Scenario: Candidate selection shown after extraction completes
- **WHEN** the SSE stream emits `event: done` with `nameCandidates: ["候補A", "候補B", "候補C"]`
- **THEN** `UrlRegistrationModal` transitions to a `nameSelection` state
- **AND** displays all candidates plus the original (extracted) name as selectable options
- **AND** does NOT immediately call `onExtracted` or open `CreateItemModal`

#### Scenario: User selects a candidate
- **WHEN** the user clicks one of the candidate buttons or the original name button
- **THEN** `UrlRegistrationModal` closes
- **AND** `CreateItemModal` opens with the selected name as `initialName`

#### Scenario: No candidate selection UI when name is short
- **WHEN** the SSE stream emits `event: done` with no `nameCandidates` field (or empty array)
- **THEN** `UrlRegistrationModal` behaves as before: immediately calls `onExtracted` and closes

#### Scenario: User can cancel during candidate selection
- **WHEN** the modal is in `nameSelection` state
- **AND** the user clicks the cancel button
- **THEN** `UrlRegistrationModal` closes without calling `onExtracted`
