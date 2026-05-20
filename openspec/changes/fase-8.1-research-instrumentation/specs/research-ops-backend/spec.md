## ADDED Requirements

### Requirement: Cohort filter on /admin/users

The endpoint GET `/api/v1/admin/users` SHALL accept an optional query parameter `cohort: str`. When present, the result list SHALL include only users with `users.cohort = :cohort`. The `UserAdminListItem` response SHALL include a `cohort: str | None` field.

#### Scenario: Filter to piloto cohort

Given users with cohort values `piloto-fase1`, `dev`, and `NULL`
When admin requests `/admin/users?cohort=piloto-fase1`
Then only users with `cohort='piloto-fase1'` SHALL be returned

### Requirement: Set user cohort endpoint

The backend SHALL expose `PATCH /api/v1/admin/users/{user_id}/cohort` with body `{cohort: str | null}`. Sets `users.cohort` to the new value (or null). Writes an `audit_logs` entry with `action="change_config"`, `target_type="user_cohort"`, `details={old: ..., new: ...}`. Admin-only.

#### Scenario: Assign a user to piloto-fase1

Given a user with `cohort=NULL`
When admin PATCHes `/admin/users/<id>/cohort` with `{cohort: "piloto-fase1"}`
Then `users.cohort` SHALL be `piloto-fase1`
And an audit log entry SHALL exist

#### Scenario: Clear a user's cohort

Given a user with `cohort='piloto-fase1'`
When admin PATCHes with `{cohort: null}`
Then `users.cohort` SHALL be NULL

### Requirement: Cohort filter on metrics endpoints

All endpoints under `/api/v1/admin/metrics/*` (usage, wellbeing, technical, safety, study) SHALL accept optional query param `cohort: str`. When present, the aggregations SHALL JOIN `sessions` with `users` and filter by `users.cohort = :cohort`. The `/admin/dashboard` endpoint SHALL also accept this param.

#### Scenario: Tab E filters to piloto-fase1 by default (frontend)

Given the frontend Tab E sends `?cohort=piloto-fase1`
When the backend serves `/admin/metrics/study?cohort=piloto-fase1`
Then SUS, empathy, wellbeing pre/post SHALL be computed only over users with that cohort

#### Scenario: Omitting cohort returns all

Given no cohort param is sent
When the backend serves the endpoint
Then no cohort filter SHALL be applied (current behavior preserved)

### Requirement: Study lock middleware on /admin/config/:key

When `system_config.study_lock_enabled.value = true`, the endpoint `PATCH /api/v1/admin/config/{key}` SHALL return `423 Locked` for keys in the set `{safety_keywords, sos_severity_threshold, guardrails_enabled}` UNLESS the request includes header `X-Study-Lock-Override: true`. The 423 response SHALL include `{"detail": "STUDY_LOCK_ENABLED", "key": ...}`.

When the override header is present, the PATCH SHALL proceed AND the audit log entry SHALL include `details.override = true`.

The key `study_lock_enabled` itself SHALL be patchable at any time (not locked by itself).

#### Scenario: Locked PATCH returns 423

Given `study_lock_enabled = true`
When admin PATCHes `/admin/config/safety_keywords` without override header
Then the response SHALL be 423 with detail `STUDY_LOCK_ENABLED`

#### Scenario: Override allows PATCH but logs flag

Given `study_lock_enabled = true`
When admin PATCHes with header `X-Study-Lock-Override: true`
Then the change SHALL apply
And the audit log entry SHALL have `details.override = true`

#### Scenario: Lock toggle itself is not locked

Given `study_lock_enabled = true`
When admin PATCHes `/admin/config/study_lock_enabled` with `{value: false}`
Then the response SHALL be 200 (the lock toggle is exempt)

### Requirement: Login audit

The endpoint `POST /api/v1/auth/login` SHALL write an `audit_logs` entry on every successful login with `action="login"`, `target_type="user"`, `target_id=user.id`, `details={role: user.role, remember_me: body.remember_me}`, `ip=request.client.host`. Failed logins SHALL NOT be audited.

#### Scenario: Successful admin login is audited

Given admin credentials are valid
When the login endpoint succeeds
Then an `audit_logs` row SHALL exist with `action="login"`, `admin_id=user.id`, `details.role="admin"`

#### Scenario: Failed login is not audited

Given a wrong password is submitted
When the login fails
Then NO new `audit_logs` row SHALL be created
