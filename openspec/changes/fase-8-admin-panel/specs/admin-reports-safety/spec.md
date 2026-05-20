## ADDED Requirements

### Requirement: List reports endpoint

The backend SHALL expose GET `/api/v1/admin/reports` with filters: `reason` (hallucination|harmful|privacy|low_empathy|other), `severity` (1-5), `status` (open|triaged|resolved|dismissed), `from`, `to`, `page`, `page_size`. Response: `{items, total, page, page_size}`. Items contain: `id`, `message_id`, `reporter_id_truncated` (8 chars), `reason`, `severity`, `status`, `created_at`, `triaged_at`. The endpoint SHALL NOT return `messages.content`.

#### Scenario: Filter by status open

Given there are reports with status `open` and `resolved`
When admin requests `/admin/reports?status=open`
Then the response SHALL only include open reports

### Requirement: Update report status endpoint

The backend SHALL expose PATCH `/api/v1/admin/reports/:id` with body `{status: triaged|resolved|dismissed, notes?: str}`. State transitions allowed: open → triaged → resolved | dismissed. Invalid transition SHALL return 409. The endpoint SHALL update `status`, set `triaged_at` (when moving to triaged), `triaged_by = admin.id`, append `notes` to existing record. The endpoint SHALL write an `audit_logs` entry with `action="review_report"`.

#### Scenario: Transition open to triaged

Given a report in status `open`
When admin PATCHes status to `triaged`
Then status SHALL be `triaged`, `triaged_at` SHALL be set, `triaged_by` SHALL be admin.id

#### Scenario: Invalid transition

Given a report in status `resolved`
When admin PATCHes status to `triaged`
Then the response SHALL be 409

### Requirement: List safety events endpoint

The backend SHALL expose GET `/api/v1/admin/safety-events` with filters: `event_type`, `severity` (extracted from `payload->>'severity'`), `status` (active|reviewed|resolved), `from`, `to`, `page`, `page_size`. Response shape mirrors reports. Items contain `id`, `event_type`, `session_id_truncated`, `severity` (from payload, may be null for non-risk events), `status`, `created_at`, `payload` (sanitized). The endpoint SHALL NOT include any message content. The endpoint SHALL be admin-only.

#### Scenario: Filter by event_type

Given there are safety events with `event_type` values `risk_detected` and `redirect_shown`
When admin requests `/admin/safety-events?event_type=risk_detected`
Then only `risk_detected` events SHALL appear in the response

### Requirement: Update safety event status endpoint

The backend SHALL expose PATCH `/api/v1/admin/safety-events/:id` with body `{status: reviewed|resolved, notes?: str}`. State transitions allowed: active → reviewed → resolved. The endpoint SHALL write an `audit_logs` entry with `action="review_safety_event"`.

#### Scenario: Mark as reviewed

Given a safety event with `status="active"`
When admin PATCHes `/admin/safety-events/<id>` with `{status: "reviewed"}`
Then `status` SHALL be `reviewed`
And an audit log entry with `action="review_safety_event"` SHALL exist

### Requirement: CSV export — reports

The backend SHALL expose GET `/api/v1/admin/reports/export.csv` returning `text/csv` via `StreamingResponse`. The CSV SHALL contain headers: `id, reporter_id_hash, message_id, reason, severity, status, created_at, triaged_at`. `reporter_id_hash` is `sha256(reporter_id)[:16]`. The endpoint SHALL write an `audit_logs` entry with `action="export_data"` and `details={"resource": "reports", "filters": ...}`.

#### Scenario: CSV export anonymized

Given a report with reporter_id `<uuid>`
When the CSV is generated
Then the row SHALL contain `sha256(uuid)[:16]` instead of the raw UUID

### Requirement: CSV export — safety events

The backend SHALL expose GET `/api/v1/admin/safety-events/export.csv` with analogous behavior. Columns: `id, event_type, session_id_hash, user_id_hash, severity, status, created_at`.

#### Scenario: Safety events CSV anonymized

Given a safety event has `user_id=<uuid>`
When the CSV is generated
Then the row SHALL contain `sha256(uuid)[:16]` in `user_id_hash`

### Requirement: Admin reports page (#26)

The frontend SHALL provide `/admin/reports` with: top indicators (Pendientes badge, Revisados hoy, Tiempo promedio), filter bar (reason, severity, status, date range), reports table with chips colored by reason and badges colored by severity, expandable detail per row showing notes history, status change buttons (Marcar como triaged / resolved / dismissed). An `ExportCsvButton` SHALL be visible at the top.

#### Scenario: Change status from row action

Given a report row with status `open`
When the admin clicks "Marcar como triaged"
Then PATCH `/admin/reports/<id>` SHALL be called with `{status: "triaged"}`
And the row SHALL reflect the new status after the response

### Requirement: Admin safety events page (#25)

The frontend SHALL provide `/admin/safety-events` with: filter bar, table (columns: fecha/hora, tipo evento, severidad badge, session_id truncado, estado chip, acciones), expandable detail showing formatted JSON payload, status change buttons. The page SHALL NOT display any message content or hint of it. `ExportCsvButton` at the top.

#### Scenario: Detail expansion shows payload only

Given a safety event row is expanded
When the detail view renders
Then it SHALL show event_type, payload (formatted JSON), session_id, system actions
And SHALL NOT show message content or username
