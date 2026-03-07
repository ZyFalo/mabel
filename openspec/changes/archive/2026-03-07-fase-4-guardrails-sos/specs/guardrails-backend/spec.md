## ADDED Requirements

### Requirement: GuardrailsService
The backend SHALL provide a `GuardrailsService` in `app/services/guardrails_service.py` for pre-filtering and post-filtering messages.

#### Scenario: Pre-filter user message
- **WHEN** `pre_filter(content: str, session_id: UUID, user_id: UUID)` is called
- **THEN** it SHALL load `safety_keywords` from system_config cache
- **THEN** it SHALL load `guardrails_enabled` from system_config cache
- **THEN** if `guardrails_enabled` is false, it SHALL return `{ "risk_detected": false }`
- **THEN** it SHALL check if any keyword from `safety_keywords` appears in the lowercase content
- **THEN** if keywords are found, it SHALL calculate severity: base keywords sum 1 each, critical keywords ("suicidio", "morir", "hacerme dano") sum 2 each, capped at 5
- **THEN** it SHALL load `sos_severity_threshold` from system_config cache (default 3)
- **THEN** if severity >= threshold, it SHALL return `{ "risk_detected": true, "severity": N, "keywords": [...] }`
- **THEN** it SHALL register a `safety_event` with `event_type` = "risk_detected", `payload` = `{ "keywords": [...], "severity": N, "message_id": null, "filter": "pre" }`, `user_id`, `session_id`
- **THEN** if no keywords found, it SHALL return `{ "risk_detected": false }`

#### Scenario: Post-filter assistant response
- **WHEN** `post_filter(content: str, session_id: UUID, user_id: UUID, message_id: UUID | None)` is called
- **THEN** it SHALL perform the same keyword matching as pre-filter on the assistant response
- **THEN** if keywords found, it SHALL register a `safety_event` with `event_type` = "risk_detected", `payload` = `{ "keywords": [...], "severity": N, "message_id": "uuid_or_null", "filter": "post" }`
- **THEN** it SHALL return `{ "risk_detected": true, "severity": N, "keywords": [...] }`
- **THEN** if no keywords found, it SHALL return `{ "risk_detected": false }`

### Requirement: SafetyEventRepository
The backend SHALL provide a `SafetyEventRepository` in `app/repositories/safety_event_repository.py`.

#### Scenario: Create safety event
- **WHEN** `create(user_id, session_id, event_type, payload)` is called
- **THEN** it SHALL INSERT into `safety_events` with columns: `user_id` (nullable UUID), `session_id` (nullable UUID), `event_type` (TEXT NOT NULL), `payload` (JSONB), `status` (default "active"), `created_at` (default)
- **THEN** it SHALL return the created SafetyEvent

### Requirement: SystemConfigRepository
The backend SHALL provide a `SystemConfigRepository` in `app/repositories/system_config_repository.py` with in-memory cache.

#### Scenario: Load config with cache
- **WHEN** the repository is instantiated
- **THEN** it SHALL NOT load data immediately (lazy loading)
- **WHEN** `get_value(key: str)` is called for the first time
- **THEN** it SHALL load ALL rows from `system_config` and cache them in a dict
- **THEN** subsequent calls SHALL return from cache without DB query
- **THEN** it SHALL return the `value` (JSONB) for the given key, or None if not found

#### Scenario: Specific config keys
- **THEN** `get_safety_keywords()` SHALL return a `list[str]` parsed from `safety_keywords` value
- **THEN** `get_sos_threshold()` SHALL return an `int` parsed from `sos_severity_threshold` value (default 3)
- **THEN** `get_guardrails_enabled()` SHALL return a `bool` parsed from `guardrails_enabled` value (default true)
- **THEN** `get_sos_hotline_numbers()` SHALL return a `list[dict]` parsed from `sos_hotline_numbers` value

### Requirement: Safety events router
The backend SHALL provide a router for creating safety events.

#### Scenario: Create safety event (POST /api/v1/safety-events)
- **WHEN** an authenticated user sends `POST /api/v1/safety-events` with body `{ "event_type": "redirect_shown", "payload": { "trigger": "auto"|"manual", "lines_shown": [...] } }`
- **THEN** it SHALL validate `event_type` is one of: "risk_detected", "redirect_shown", "user_report"
- **THEN** it SHALL INSERT with `user_id` = current_user.id, `session_id` from payload if present
- **THEN** it SHALL return 201 with the created event

### Requirement: System config public endpoint
The backend SHALL provide a read-only endpoint for SOS data.

#### Scenario: Get SOS config (GET /api/v1/system-config/sos)
- **WHEN** an authenticated user sends `GET /api/v1/system-config/sos`
- **THEN** it SHALL return `{ "hotline_numbers": [...], "guardrails_enabled": bool }`
- **THEN** `hotline_numbers` SHALL be the parsed array from `sos_hotline_numbers` config key
- **THEN** each hotline entry SHALL have `name` (string) and `number` (string)

### Requirement: Pydantic schemas for guardrails
The backend SHALL define DTOs for guardrails endpoints.

#### Scenario: Safety event schemas
- **THEN** `CreateSafetyEventRequest` SHALL have fields: `event_type` (Literal["risk_detected","redirect_shown","user_report"]), `payload` (dict), `session_id` (UUID | None)
- **THEN** `SafetyEventResponse` SHALL have fields: `id` (UUID), `event_type` (str), `payload` (dict | None), `status` (str), `created_at` (datetime), with `from_attributes = True`
- **THEN** `SosConfigResponse` SHALL have fields: `hotline_numbers` (list[dict]), `guardrails_enabled` (bool)
