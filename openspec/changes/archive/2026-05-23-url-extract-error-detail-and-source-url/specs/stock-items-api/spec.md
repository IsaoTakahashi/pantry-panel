## MODIFIED Requirements

### Requirement: List stock items
The system SHALL return all stock items ordered by sorted_at descending via `GET /api/stock-items`, including `sourceUrl` in each item.

#### Scenario: Empty list
- **WHEN** no stock items exist in the database
- **THEN** the API returns 200 with an empty array `[]`

#### Scenario: Multiple items
- **WHEN** stock items exist in the database
- **THEN** the API returns 200 with all items ordered by sorted_at descending
- **AND** each item includes id, name, category, imageUrl, wantToBuy, sourceUrl, createdAt, updatedAt, sortedAt
- **AND** `sourceUrl` is `null` for items not registered via URL

### Requirement: Create stock item
The system SHALL create a new stock item via `POST /api/stock-items` with name, category, optional wantToBuy, and optional sourceUrl.

#### Scenario: Successful creation
- **WHEN** a valid request with name and category is sent
- **THEN** the API returns 201 with the created item
- **AND** the item has wantToBuy=false, imageUrl=null, sourceUrl=null, and generated id/timestamps
- **AND** sorted_at is set to the creation time

#### Scenario: Successful creation with wantToBuy=true
- **WHEN** a valid request with name, category, and wantToBuy=true is sent
- **THEN** the API returns 201 with the created item
- **AND** the item has wantToBuy=true
- **AND** sorted_at is set to the creation time

#### Scenario: Successful creation with sourceUrl
- **WHEN** a valid request includes a `sourceUrl` field
- **THEN** the API returns 201 with the created item
- **AND** the item has `sourceUrl` equal to the submitted value

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
The system SHALL partially update a stock item via `PATCH /api/stock-items/:id`, including optional `sourceUrl` update.

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

#### Scenario: Update sourceUrl
- **WHEN** a request with a new `sourceUrl` value is sent for an existing item
- **THEN** the API returns 200 with the updated item
- **AND** `sourceUrl` is updated to the new value
- **AND** `sourceUrl` MAY be set to null to clear it

#### Scenario: Item not found
- **WHEN** a request is sent for a non-existent item ID
- **THEN** the API returns 404 Not Found

#### Scenario: Duplicate name on update
- **WHEN** a request with a name that another item already has is sent
- **THEN** the API returns 409 Conflict with an error message

### Requirement: JSON response format
The system SHALL return JSON responses with camelCase keys, including `sourceUrl`.

#### Scenario: Response key format
- **WHEN** any stock item is returned in a response
- **THEN** keys use camelCase (e.g., wantToBuy, imageUrl, sourceUrl, createdAt, updatedAt, sortedAt)
- **AND** `sourceUrl` is `null` when no URL is associated with the item

## ADDED Requirements

### Requirement: ItemCard source URL link
The system SHALL display an external link icon in `ItemCard` when the item has a non-null `sourceUrl`, allowing navigation to the original product page.

#### Scenario: Link icon shown when sourceUrl exists
- **WHEN** a stock item has a non-null `sourceUrl`
- **THEN** `ItemCard` renders an `MdOpenInNew` icon button in the action button row
- **AND** clicking the icon opens `sourceUrl` in a new browser tab with `rel="noopener noreferrer"`

#### Scenario: Link icon hidden when sourceUrl is null
- **WHEN** a stock item has `sourceUrl=null`
- **THEN** `ItemCard` does NOT render the external link icon
