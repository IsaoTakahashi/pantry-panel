## MODIFIED Requirements

### Requirement: Create stock item
The system SHALL create a new stock item via `POST /api/stock-items` with name, category, and optional wantToBuy.

#### Scenario: Successful creation
- **WHEN** a valid request with name and category is sent
- **THEN** the API returns 201 with the created item
- **AND** the item has wantToBuy=false, imageUrl=null, and generated id/timestamps

#### Scenario: Successful creation with wantToBuy=true
- **WHEN** a valid request with name, category, and wantToBuy=true is sent
- **THEN** the API returns 201 with the created item
- **AND** the item has wantToBuy=true

#### Scenario: Duplicate name
- **WHEN** a request with a name that already exists is sent
- **THEN** the API returns 409 Conflict with an error message

#### Scenario: Missing name
- **WHEN** a request without a name is sent
- **THEN** the API returns 400 Bad Request with an error message

#### Scenario: Missing category
- **WHEN** a request without a category is sent
- **THEN** the API returns 400 Bad Request with an error message
