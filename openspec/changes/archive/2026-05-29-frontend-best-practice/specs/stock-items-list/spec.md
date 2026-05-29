## MODIFIED Requirements

### Requirement: API error on mutation shows user-facing message
When a CRUD mutation (create / update / delete / image select / group rename / group create) fails, the system SHALL display an error message to the user. Silent failures are NOT acceptable. The error message SHALL be shown in the existing inline error display area.

#### Scenario: Create item fails
- **WHEN** the user submits a new item and the API returns an error
- **THEN** the modal closes (or stays open based on implementation)
- **AND** an error message is displayed in the main page error area

#### Scenario: Toggle wantToBuy fails
- **WHEN** the user toggles wantToBuy and the API returns an error
- **THEN** the item's wantToBuy state is reverted to its original value
- **AND** an error message is displayed

#### Scenario: Delete item fails
- **WHEN** the user confirms deletion and the API returns an error
- **THEN** the item is NOT removed from the list
- **AND** an error message is displayed

### Requirement: Delete confirmation uses in-app dialog
The system SHALL use an in-app `ConfirmDialog` component for delete confirmation instead of `window.confirm`. The dialog MUST be dismissable and MUST require explicit confirmation before deletion proceeds.

#### Scenario: Delete button triggers ConfirmDialog
- **WHEN** the user clicks the delete button on an item
- **THEN** a `ConfirmDialog` appears showing the item name
- **AND** no deletion API call is made yet

#### Scenario: Cancel in ConfirmDialog aborts deletion
- **WHEN** the user clicks "キャンセル" in the ConfirmDialog
- **THEN** the dialog closes and the item is NOT deleted
