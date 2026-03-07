## ADDED Requirements

### Requirement: DELETE account endpoint
The backend SHALL expose DELETE /api/v1/users/me that performs hard DELETE with CASCADE (D-14). It SHALL require confirmation text "ELIMINAR".

#### Scenario: Successful account deletion
- **WHEN** authenticated student sends DELETE /api/v1/users/me with confirmation "ELIMINAR"
- **THEN** it SHALL execute DELETE FROM users, return 200 with success message
- **THEN** CASCADE SHALL delete consents, preferences, sessions, messages, attachments, message_reports, password_reset_tokens
- **THEN** SET NULL SHALL preserve safety_events, survey_responses, audit_logs, consent_versions, system_config

#### Scenario: Wrong confirmation text
- **WHEN** confirmation is not exactly "ELIMINAR" (case-sensitive)
- **THEN** it SHALL return 400 with appropriate detail

### Requirement: ARCO data export endpoint
The backend SHALL expose GET /api/v1/users/me/export with format query param (json|csv) for Ley 1581/2012 compliance.

#### Scenario: Export as JSON
- **WHEN** authenticated student calls GET /api/v1/users/me/export?format=json
- **THEN** it SHALL return 200 with account, consent, preferences, and usage_stats sections

#### Scenario: Export as CSV
- **WHEN** format=csv is requested
- **THEN** it SHALL return Content-Type text/csv with two-column key-value format

#### Scenario: Export excludes message content
- **WHEN** data is collected for export
- **THEN** it SHALL NOT include message content, safety_event details, or survey raw_data

### Requirement: AccountService
The service SHALL implement delete_account and export_data methods.

#### Scenario: delete_account validates confirmation
- **WHEN** confirmation is not "ELIMINAR"
- **THEN** it SHALL raise ValueError("INVALID_CONFIRMATION")

#### Scenario: export_data collects from multiple tables
- **WHEN** export_data is called
- **THEN** it SHALL query users, consents, preferences, sessions, messages tables and return aggregated data

### Requirement: DeleteAccountRequest schema
The schema SHALL validate that confirmation field exactly matches "ELIMINAR" (case-sensitive).

#### Scenario: Rejects wrong confirmation
- **WHEN** DeleteAccountRequest is created with confirmation != "ELIMINAR"
- **THEN** Pydantic SHALL raise ValidationError

### Requirement: UserRepository delete method
The repository SHALL be extended with a delete(user_id) method that executes DELETE FROM users.

#### Scenario: Delete existing user
- **WHEN** repo.delete(user_id) is called for existing user
- **THEN** it SHALL delete the row and return True

#### Scenario: Delete non-existent user
- **WHEN** repo.delete(user_id) is called for non-existent user
- **THEN** it SHALL return False
