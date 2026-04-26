## ADDED Requirements

### Requirement: List stock items
The system SHALL return all stock items ordered by updated_at descending via `GET /api/stock-items`.

#### Scenario: Empty list
- **WHEN** no stock items exist in the database
- **THEN** the API returns 200 with an empty array `[]`

#### Scenario: Multiple items
- **WHEN** stock items exist in the database
- **THEN** the API returns 200 with all items ordered by updated_at descending
- **AND** each item includes id, name, category, imageUrl, wantToBuy, createdAt, updatedAt

### Requirement: Create stock item
The system SHALL create a new stock item via `POST /api/stock-items` with name and category.

#### Scenario: Successful creation
- **WHEN** a valid request with name and category is sent
- **THEN** the API returns 201 with the created item
- **AND** the item has wantToBuy=false, imageUrl=null, and generated id/timestamps

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

#### Scenario: Update category
- **WHEN** a request with a new category is sent for an existing item
- **THEN** the API returns 200 with the updated item
- **AND** updated_at is refreshed

#### Scenario: Update wantToBuy
- **WHEN** a request with wantToBuy=true is sent for an existing item
- **THEN** the API returns 200 with the updated item
- **AND** updated_at is refreshed

#### Scenario: Item not found
- **WHEN** a request is sent for a non-existent item ID
- **THEN** the API returns 404 Not Found

#### Scenario: Duplicate name on update
- **WHEN** a request with a name that another item already has is sent
- **THEN** the API returns 409 Conflict with an error message

### Requirement: Delete stock item
The system SHALL delete a stock item via `DELETE /api/stock-items/:id`.

#### Scenario: Successful deletion
- **WHEN** a delete request is sent for an existing item with wantToBuy=false
- **THEN** the API returns 204 No Content
- **AND** the item is removed from the database

#### Scenario: Cannot delete item in shopping list
- **WHEN** a delete request is sent for an item with wantToBuy=true
- **THEN** the API returns 409 Conflict with an error message

#### Scenario: Item not found
- **WHEN** a delete request is sent for a non-existent item ID
- **THEN** the API returns 404 Not Found

### Requirement: JSON response format
The system SHALL return JSON responses with camelCase keys.

#### Scenario: Response key format
- **WHEN** any stock item is returned in a response
- **THEN** keys use camelCase (e.g., wantToBuy, imageUrl, createdAt, updatedAt)
