## ADDED Requirements

### Requirement: Extract product info from URL endpoint
The system SHALL provide `POST /api/extract-from-url` as an extension to the stock items API surface.

#### Scenario: Route is registered
- **WHEN** the backend starts
- **THEN** `POST /api/extract-from-url` is registered and returns a non-404 response for valid requests
