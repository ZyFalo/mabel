## ADDED Requirements

### Requirement: List users endpoint

The backend SHALL expose GET `/api/v1/admin/users` with query params `q` (search), `status` (`active|disabled`), `consent_status` (`ok|no_consent|revoked|new_version_required`), `created_from` (ISO date), `created_to`, `page`, `page_size`. The response SHALL be `{items: [UserAdminListItem], total: int, page: int, page_size: int}`. Each item SHALL contain: `id`, `email_masked`, `display_name`, `role`, `created_at`, `last_session_at` (nullable), `consent_status`, `total_sessions`, `disabled_at`. The endpoint SHALL require admin role. The endpoint SHALL log an `audit_logs` entry only if a filter (other than defaults) is applied.

#### Scenario: Search by email

Given there is a user with email `juan@est.umb.edu.co`
When the admin calls `/admin/users?q=juan`
Then the response SHALL include that user

#### Scenario: Email is masked in list

Given a user with email `juan@est.umb.edu.co`
When the admin retrieves the user list
Then the response SHALL return `email_masked: "j***@est.umb.edu.co"`
And SHALL NOT include the full email

### Requirement: User detail endpoint

The backend SHALL expose GET `/api/v1/admin/users/:id` returning a detailed view: identity (id, email_masked, display_name, role, created_at, disabled_at, disabled_reason), consent (current version, scope, accepted_at, revoked_at), preferences flags (save_history bool, checkin_enabled bool, has_tts_voice bool, accessibility_keys list), and statistics (total_sessions, last_session_at, avg_messages_per_session, total_reports, total_safety_events). The response SHALL NOT include any `messages.content`. The endpoint SHALL write an `audit_logs` entry with `action="view_user"`.

#### Scenario: View user detail logs the access

Given an admin requests `/admin/users/<id>`
When the endpoint succeeds
Then an `audit_logs` row SHALL exist with `action="view_user"` and `target_id=<id>`

### Requirement: Disable user endpoint

The backend SHALL expose PATCH `/api/v1/admin/users/:id/disable` with body `{reason: str}` (required, min length 10). The endpoint SHALL set `users.disabled_at = now()` and `users.disabled_reason = body.reason`. The endpoint SHALL write an `audit_logs` entry with `action="disable_user"` and `details={reason}`. Already-disabled users SHALL return 409. Admin users SHALL NOT be disable-able (return 403).

#### Scenario: Disable student user

Given a student user is active
When admin PATCHes `/admin/users/<id>/disable` with `{reason: "incumplimiento de terminos de uso"}`
Then `disabled_at` and `disabled_reason` SHALL be set
And an audit log SHALL be created

#### Scenario: Cannot disable admin

Given a target user has `role="admin"`
When admin PATCHes `/admin/users/<id>/disable`
Then the response SHALL be 403

### Requirement: Admin users page (#28)

The frontend SHALL provide `/admin/users` (route under `AdminLayout`) with: filter bar (text search, status select, consent_status select, date range), users table (columns: ID truncated, email_masked, fecha registro, ultimo acceso, consentimiento chip, total sesiones, acciones), pagination. Clicking a row SHALL navigate to `/admin/users/:id`. The page SHALL include a "Deshabilitar" action button per row (opens modal).

#### Scenario: Click row navigates to detail

Given the users table renders a row for user `<id>`
When the admin clicks the row
Then the router SHALL navigate to `/admin/users/<id>`

### Requirement: Admin user detail page (#29)

The frontend SHALL provide `/admin/users/:id` showing four sections: Informacion general, Consentimiento, Preferencias (chips ON/OFF), Estadisticas. A "Deshabilitar cuenta" button SHALL open a modal with a required textarea for reason (min 10 chars). Submission SHALL call the disable endpoint and on success navigate back to `/admin/users`.

#### Scenario: Disable modal requires reason

Given the disable modal is open
When the admin tries to submit with an empty reason
Then the submit button SHALL be disabled
