## ADDED Requirements

### Requirement: Display stock items list
The system SHALL display all stock items on the main page, ordered by most recently updated first.

#### Scenario: No items exist
- **WHEN** the user opens the app and no stock items exist
- **THEN** an empty state message is displayed

#### Scenario: Items exist
- **WHEN** the user opens the app and stock items exist
- **THEN** all items are displayed as cards with name, category, and wantToBuy status
- **AND** items are ordered by updated_at descending

#### Scenario: Loading state
- **WHEN** the app is fetching stock items from the API
- **THEN** a loading indicator is displayed

#### Scenario: API error
- **WHEN** the API request fails
- **THEN** an error message is displayed

### Requirement: Create stock item via modal
The system SHALL allow users to create a new stock item through a modal dialog.

#### Scenario: Open creation modal
- **WHEN** the user clicks the "商品を追加" button
- **THEN** a modal opens with name (text input) and category (select) fields

#### Scenario: Successful creation
- **WHEN** the user fills in name and category and submits
- **THEN** the modal closes
- **AND** the new item appears at the top of the list

#### Scenario: Duplicate name error
- **WHEN** the user submits a name that already exists
- **THEN** an error message "その商品は登録済みです" is displayed in the modal

#### Scenario: Validation
- **WHEN** the user tries to submit with an empty name or no category selected
- **THEN** the submit button is disabled

### Requirement: Delete stock item
The system SHALL allow users to delete a stock item that is not in the shopping list.

#### Scenario: Delete button visible
- **WHEN** an item has wantToBuy=false
- **THEN** a delete button is displayed on the card

#### Scenario: Delete button hidden
- **WHEN** an item has wantToBuy=true
- **THEN** the delete button is not displayed (or disabled)

#### Scenario: Confirm and delete
- **WHEN** the user clicks the delete button
- **THEN** a confirmation dialog is displayed
- **AND** upon confirmation, the item is removed from the list

### Requirement: Category options
The system SHALL provide a fixed list of categories for selection.

#### Scenario: Category list
- **WHEN** the user opens the category selector (in creation modal or elsewhere)
- **THEN** the following categories are available: ★, 洗面, 100均, KALDI, 調味料, 飲み物, 缶詰, おかず, おかずの素, おやつ, その他
