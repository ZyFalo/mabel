## ADDED Requirements

### Requirement: List system config endpoint (admin scope)

The backend SHALL expose GET `/api/v1/admin/config` returning all `system_config` rows: `[{key, value, updated_at}]`. Currently includes `sos_hotline_numbers`, `safety_keywords`, `sos_severity_threshold`, `guardrails_enabled`. Admin-only.

#### Scenario: List returns all config rows

Given the `system_config` table has 4 rows
When admin requests `/admin/config`
Then the response SHALL contain 4 items with their key, value, and updated_at

### Requirement: Update system config entry

The backend SHALL expose PATCH `/api/v1/admin/config/:key` with body `{value: JSON}`. The endpoint SHALL validate `value` shape per key:
- `sos_hotline_numbers`: list of `{name: str, number: str (digits only, 7-12 chars)}`
- `safety_keywords`: list of `str` (unique, lowercase)
- `sos_severity_threshold`: int 1-5
- `guardrails_enabled`: bool

Invalid value SHALL return 422. The endpoint SHALL write an `audit_logs` entry with `action="change_config"` and `details={key, old_value, new_value}`.

#### Scenario: Update keywords with duplicates

Given the admin sends `{value: ["x", "x", "y"]}` for key `safety_keywords`
When the endpoint validates
Then the response SHALL be 422

### Requirement: Create consent version endpoint

The backend SHALL expose POST `/api/v1/admin/consent-versions` with body `{version: str, title: str, body: str}`. The endpoint SHALL insert a new `consent_versions` row with `status="draft"`. A second endpoint POST `/api/v1/admin/consent-versions/:id/publish` SHALL transition the row to `status="active"` and archive the previous active version. Both endpoints SHALL write `audit_logs` entries.

#### Scenario: Publishing archives previous

Given there is an existing active consent_version
When admin publishes a new version
Then the previous active SHALL become `status="archived"`
And the new version SHALL be `status="active"`

### Requirement: Gemini connection test endpoint

The backend SHALL expose POST `/api/v1/admin/config/gemini/test` that performs a lightweight call to Gemini with prompt `"ping"` and returns `{ok: bool, latency_ms: int, model: str, error?: str}`. The endpoint SHALL NOT log the prompt or response.

#### Scenario: Gemini connection works

Given the Gemini API is reachable
When admin POSTs `/admin/config/gemini/test`
Then the response SHALL be 200 with `ok: true` and a non-zero `latency_ms`

#### Scenario: Gemini unreachable

Given the Gemini API returns an error
When admin POSTs the test endpoint
Then the response SHALL be 200 with `ok: false` and a populated `error` field

### Requirement: List audit logs endpoint

The backend SHALL expose GET `/api/v1/admin/logs` with filters: `admin_id`, `action`, `from`, `to`, `page`, `page_size`. Response: `{items, total, page, page_size}`. Items contain: `id`, `admin_id`, `admin_email_masked`, `action`, `target_type`, `target_id`, `details` (JSONB), `ip` (nullable), `created_at`. The endpoint SHALL be admin-only. Audit logs SHALL be append-only — there is no PATCH or DELETE endpoint.

#### Scenario: Filter by action

Given audit logs exist with various actions
When admin requests `/admin/logs?action=disable_user`
Then only `disable_user` entries SHALL be returned

### Requirement: Audit logs CSV export

The backend SHALL expose GET `/api/v1/admin/logs/export.csv` that streams `text/csv`. Columns: `id, admin_id_hash, action, target_type, target_id_hash, created_at, ip`. The action of exporting SHALL itself be logged.

#### Scenario: Export is itself audited

Given an admin requests `/admin/logs/export.csv`
When the CSV is returned
Then an `audit_logs` row with `action="export_data"` and `details.resource="logs"` SHALL be inserted

### Requirement: Admin config page (#30)

The frontend SHALL provide `/admin/config` with sections:
- **Consentimiento**: current version display, "Crear nueva version" form (version, title, body textarea), publish button (with re-acceptance warning)
- **Guardrails**: editable keyword list (add/remove with deduplication), severity threshold slider (1-5), enabled toggle
- **Lineas de Crisis SOS**: editable list with name + phone, add/reorder/delete; saves to `sos_hotline_numbers`
- **API Gemini**: model (read-only from env), timeout (read-only), test connection button (calls `/admin/config/gemini/test`)
- **Estado del Sistema**: app version, DB status indicator, ASR/TTS status, uptime, PWA service worker info

All edits SHALL post to PATCH `/admin/config/:key` and show toast on success/error.

#### Scenario: Add hotline

Given the admin adds an entry `{name: "Linea Vida", number: "018000113113"}`
When the admin saves
Then PATCH `/admin/config/sos_hotline_numbers` SHALL fire with the new list

### Requirement: Admin audit logs page (#31)

The frontend SHALL provide `/admin/logs` with: filter bar (admin select, action select, date range), `DataTable` (columns: fecha/hora, admin email_masked, action chip, detail truncated, IP), pagination, expandable rows showing full `details` JSON, `ExportCsvButton`.

#### Scenario: Expand row to see details

Given an audit log row is rendered with truncated detail
When the admin clicks the expand toggle
Then the full `details` JSON SHALL be displayed formatted
