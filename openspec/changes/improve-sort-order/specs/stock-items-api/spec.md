## MODIFIED Requirements

### Requirement: List stock items
The system SHALL return all stock items ordered by sorted_at descending via `GET /api/stock-items`.

#### Scenario: Empty list
- **WHEN** no stock items exist in the database
- **THEN** the API returns 200 with an empty array `[]`

#### Scenario: Multiple items
- **WHEN** stock items exist in the database
- **THEN** the API returns 200 with all items ordered by sorted_at descending
- **AND** each item includes id, name, category, imageUrl, wantToBuy, createdAt, updatedAt, sortedAt

### Requirement: Create stock item
The system SHALL create a new stock item via `POST /api/stock-items` with name, category, and optional wantToBuy.

#### Scenario: Successful creation
- **WHEN** a valid request with name and category is sent
- **THEN** the API returns 201 with the created item
- **AND** the item has wantToBuy=false, imageUrl=null, and generated id/timestamps
- **AND** sorted_at is set to the creation time

#### Scenario: Successful creation with wantToBuy=true
- **WHEN** a valid request with name, category, and wantToBuy=true is sent
- **THEN** the API returns 201 with the created item
- **AND** the item has wantToBuy=true
- **AND** sorted_at is set to the creation time

#### Scenario: Duplicate name
- **WHEN** a request with a name that already exists is sent
- **THEN** the API returns 409 Conflict with an error message

#### Scenario: Missing name
- **WHEN** a request without a name is sent
- **THEN** the API returns 400 Bad Request with an error message

#### Scenario: Missing category
- **WHEN** a request without a category is sent
- **THEN** the API returns 400 Bad Request with an error message

### Requirement: Update stock item
The system SHALL partially update a stock item via `PATCH /api/stock-items/:id`.

#### Scenario: Update name
- **WHEN** a request with a new name is sent for an existing item
- **THEN** the API returns 200 with the updated item
- **AND** updated_at is refreshed
- **AND** sorted_at is NOT changed

#### Scenario: Update category
- **WHEN** a request with a new category is sent for an existing item
- **THEN** the API returns 200 with the updated item
- **AND** updated_at is refreshed
- **AND** sorted_at is NOT changed

#### Scenario: Update wantToBuy to true
- **WHEN** a request with wantToBuy=true is sent for an existing item
- **THEN** the API returns 200 with the updated item
- **AND** updated_at is refreshed
- **AND** sorted_at is updated to now()

#### Scenario: Update wantToBuy to false
- **WHEN** a request with wantToBuy=false is sent for an existing item
- **THEN** the API returns 200 with the updated item
- **AND** updated_at is refreshed
- **AND** sorted_at is NOT changed

#### Scenario: Item not found
- **WHEN** a request is sent for a non-existent item ID
- **THEN** the API returns 404 Not Found

#### Scenario: Duplicate name on update
- **WHEN** a request with a name that another item already has is sent
- **THEN** the API returns 409 Conflict with an error message

### Requirement: JSON response format
The system SHALL return JSON responses with camelCase keys.

#### Scenario: Response key format
- **WHEN** any stock item is returned in a response
- **THEN** keys use camelCase (e.g., wantToBuy, imageUrl, createdAt, updatedAt, sortedAt)
