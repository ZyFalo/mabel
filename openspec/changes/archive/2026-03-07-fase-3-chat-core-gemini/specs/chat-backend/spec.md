## ADDED Requirements

### Requirement: LLM Provider abstraction
The backend SHALL define a `LLMProvider` Protocol in `app/services/llm/provider.py` with method `generate_stream(messages: list[dict], system_prompt: str, config: dict) -> AsyncGenerator[str, None]`.

#### Scenario: Protocol definition
- **WHEN** the LLM module is imported
- **THEN** `LLMProvider` SHALL be a `typing.Protocol` with a single async generator method `generate_stream`
- **THEN** `messages` SHALL be a list of dicts with keys `role` (str) and `content` (str)
- **THEN** `config` SHALL accept optional keys: `temperature` (float), `max_output_tokens` (int)

### Requirement: Gemini Adapter
The backend SHALL implement `GeminiAdapter` in `app/services/llm/gemini_adapter.py` that satisfies the `LLMProvider` protocol.

#### Scenario: Adapter initialization
- **WHEN** `GeminiAdapter` is instantiated
- **THEN** it SHALL use `settings.GEMINI_API_KEY` to configure the `google-generativeai` SDK
- **THEN** it SHALL use `settings.GEMINI_MODEL` (default `"gemini-2.5-flash"`) as the model
- **THEN** it SHALL use `settings.GEMINI_TIMEOUT_MS` (default `30000`) as the request timeout

#### Scenario: Streaming generation
- **WHEN** `generate_stream` is called with messages, system_prompt, and config
- **THEN** it SHALL call the Gemini API with `stream=True`
- **THEN** it SHALL yield text chunks as they arrive from Gemini
- **THEN** it SHALL pass `system_instruction` as the system prompt to Gemini
- **THEN** it SHALL map the messages list to Gemini's `contents` format (`role: "user"/"model"`)

#### Scenario: Gemini API error handling
- **WHEN** the Gemini API returns an error or times out
- **THEN** the adapter SHALL raise a `ValueError` with code `"LLM_ERROR"` and the error detail
- **THEN** the adapter SHALL NOT retry automatically (retries are a post-MVP concern)

### Requirement: System prompt
The backend SHALL define the Mabel system prompt as a constant in `app/services/llm/prompts.py`.

#### Scenario: System prompt content
- **WHEN** the system prompt is loaded
- **THEN** it SHALL define Mabel's identity as "asistente virtual de apoyo psicoeducativo de la UMB"
- **THEN** it SHALL specify empathetic tone in Colombian Spanish
- **THEN** it SHALL include limits: no diagnosticar, no prescribir medicamentos, no reemplazar profesionales
- **THEN** it SHALL instruct crisis handling: respond with empathy, suggest seeking professional help
- **THEN** it SHALL instruct to not request sensitive personal data

### Requirement: Session CRUD
The backend SHALL provide session management via `SessionRepository` and `ChatService`.

#### Scenario: Create session (POST /api/v1/sessions)
- **WHEN** an authenticated student sends `POST /api/v1/sessions` with optional body `{ "topic_hint": "string" }`
- **THEN** the service SHALL read `preferences.checkin_enabled` for the user
- **THEN** it SHALL set `sessions.checkin_opt_in` = the value of `preferences.checkin_enabled`
- **THEN** it SHALL INSERT into `sessions` with columns: `user_id`, `started_at` (default), `topic_hint`, `checkin_opt_in`, `avatar_used` (default false)
- **THEN** if INSERT fails with UniqueViolation on `uq_sessions_user_active`, it SHALL close the existing active session (`UPDATE sessions SET ended_at = NOW() WHERE user_id = :uid AND ended_at IS NULL`) and retry the INSERT
- **THEN** it SHALL return 201 with `{ id, started_at, checkin_opt_in, previous_session_closed: bool }`

#### Scenario: List sessions (GET /api/v1/sessions)
- **WHEN** an authenticated student sends `GET /api/v1/sessions`
- **THEN** the service SHALL return sessions for the current user ordered by `started_at DESC`
- **THEN** each session SHALL include: `id`, `started_at`, `ended_at`, `topic_hint`, `checkin_opt_in`, `checkin_completed_at`, `avatar_used`
- **THEN** the response SHALL be a JSON array

#### Scenario: Get session detail (GET /api/v1/sessions/:id)
- **WHEN** an authenticated student sends `GET /api/v1/sessions/:id`
- **THEN** the service SHALL verify the session belongs to the current user (403 if not)
- **THEN** it SHALL return the full session including `checkin_payload` and `meta`

#### Scenario: Update session — check-in (PATCH /api/v1/sessions/:id)
- **WHEN** an authenticated student sends `PATCH /api/v1/sessions/:id` with body `{ "checkin_payload": { "mood": 0-10, "sleep": 0-24?, "focus": "string"?, "note": "string max 500 chars"? } }`
- **THEN** the service SHALL verify the session belongs to the current user
- **THEN** it SHALL verify `ended_at IS NULL` (409 if session is ended)
- **THEN** it SHALL verify `checkin_completed_at IS NULL` (409 if check-in already completed)
- **THEN** it SHALL UPDATE `sessions` SET `checkin_payload` = the provided payload, `checkin_completed_at` = NOW()
- **THEN** it SHALL return 200 with the updated session

#### Scenario: Update session — end session (PATCH /api/v1/sessions/:id)
- **WHEN** an authenticated student sends `PATCH /api/v1/sessions/:id` with body `{ "action": "end" }`
- **THEN** the service SHALL verify the session belongs to the current user
- **THEN** it SHALL verify `ended_at IS NULL` (409 if already ended)
- **THEN** it SHALL UPDATE `sessions` SET `ended_at` = NOW()
- **THEN** it SHALL return 200 with the updated session

### Requirement: Session ownership validation
The backend SHALL validate that sessions belong to the requesting user.

#### Scenario: Unauthorized session access
- **WHEN** a user tries to access a session that belongs to another user
- **THEN** the endpoint SHALL return 403 Forbidden with `{ "detail": "Acceso denegado" }`

### Requirement: Messages CRUD
The backend SHALL provide message management with Gemini integration and streaming.

#### Scenario: Send message and get streaming response (POST /api/v1/sessions/:id/messages)
- **WHEN** an authenticated student sends `POST /api/v1/sessions/:id/messages` with body `{ "content": "string max 2000 chars" }`
- **THEN** the service SHALL verify session ownership and `ended_at IS NULL` (409 if ended)
- **THEN** it SHALL compute `content_sha256` = SHA-256 hex digest of the user message content
- **THEN** if `preferences.save_history = true`, it SHALL INSERT the user message into `messages` with columns: `session_id`, `role` = "user", `content`, `content_sha256`, `created_at` (default)
- **THEN** it SHALL fetch the last `CONTEXT_WINDOW_SIZE` (default 20) messages from the session ordered by `created_at DESC`, then reverse for chronological order
- **THEN** it SHALL call `LLMProvider.generate_stream()` with the context messages, system prompt, and config
- **THEN** it SHALL return a `StreamingResponse` with `media_type="text/event-stream"`
- **THEN** each SSE chunk SHALL be `data: {"token": "text_chunk"}\n\n`
- **THEN** the final SSE event SHALL be `data: {"done": true, "message_id": "uuid_or_null", "latency_ms": N}\n\n`
- **THEN** after streaming completes, if `save_history = true`, it SHALL INSERT the assistant message with: `session_id`, `role` = "assistant", `content` = full accumulated text, `content_sha256`, `meta` = `{"model": settings.GEMINI_MODEL}`, `tokens_prompt` (from Gemini response), `tokens_completion` (from Gemini response), `latency_ms` = elapsed milliseconds from LLM call start to stream end

#### Scenario: Send message with save_history=OFF
- **WHEN** `preferences.save_history = false` for the current user
- **THEN** the service SHALL NOT insert any rows into `messages`
- **THEN** the context window SHALL be empty (only the current message + system prompt)
- **THEN** the streaming response SHALL work identically
- **THEN** `message_id` in the final SSE event SHALL be `null`

#### Scenario: Send message to ended session
- **WHEN** a user sends `POST /api/v1/sessions/:id/messages` for a session with `ended_at IS NOT NULL`
- **THEN** the endpoint SHALL return 409 Conflict with `{ "detail": "Sesion finalizada" }`

#### Scenario: List messages (GET /api/v1/sessions/:id/messages)
- **WHEN** an authenticated student sends `GET /api/v1/sessions/:id/messages`
- **THEN** the service SHALL verify session ownership
- **THEN** it SHALL return messages ordered by `created_at ASC`
- **THEN** each message SHALL include: `id`, `role`, `content`, `created_at`, `safety_flags`
- **THEN** it SHALL NOT include `content_sha256`, `meta`, `tokens_prompt`, `tokens_completion`, `latency_ms` (internal metrics)

#### Scenario: LLM error during streaming
- **WHEN** the LLM adapter raises an error during streaming
- **THEN** the service SHALL send SSE event `data: {"error": "Error al generar respuesta. Intenta de nuevo."}\n\n`
- **THEN** no assistant message SHALL be persisted

### Requirement: Message validation
The backend SHALL validate message content.

#### Scenario: Message content validation
- **WHEN** a message is received
- **THEN** `content` SHALL NOT be empty
- **THEN** `content` SHALL NOT exceed 2000 characters
- **THEN** violation SHALL return 422 Unprocessable Entity

### Requirement: Message reports
The backend SHALL allow students to report assistant messages.

#### Scenario: Create report (POST /api/v1/messages/:id/reports)
- **WHEN** an authenticated student sends `POST /api/v1/messages/:id/reports` with body `{ "reason": "hallucination|harmful|privacy|low_empathy|other", "severity": 1-5?, "details": "string max 1000 chars"? }`
- **THEN** the service SHALL verify the message exists and belongs to a session owned by the current user
- **THEN** it SHALL verify the message `role` = "assistant" (cannot report own messages)
- **THEN** it SHALL INSERT into `message_reports` with columns: `message_id`, `reporter_id` = current_user.id, `reason`, `details`, `severity`, `status` = "open", `created_at` (default)
- **THEN** if INSERT fails with UniqueViolation on `uq_message_reports_msg_user`, it SHALL return 409 Conflict with `{ "detail": "Ya reportaste este mensaje" }`
- **THEN** it SHALL return 201 with the created report

#### Scenario: Check report status (GET /api/v1/messages/:id/reports/check)
- **WHEN** an authenticated student sends `GET /api/v1/messages/:id/reports/check`
- **THEN** it SHALL return `{ "already_reported": bool }` based on existence of a report with `message_id` and `reporter_id` = current_user.id

### Requirement: Preference repository (read-only for this phase)
The backend SHALL provide a `PreferenceRepository` to read user preferences.

#### Scenario: Get preferences by user
- **WHEN** the service needs to check `save_history` or `checkin_enabled`
- **THEN** `PreferenceRepository.get_by_user_id(user_id)` SHALL return the `Preference` record or `None`
- **THEN** if `None` (no preferences record), defaults SHALL be: `save_history=false`, `checkin_enabled=true`

### Requirement: Session router registration
The session, message, and report routers SHALL be registered in `main.py`.

#### Scenario: Router tags and prefixes
- **WHEN** the routers are registered
- **THEN** `session_router` SHALL have prefix `/api/v1/sessions` and tags `["sessions"]`
- **THEN** `message_router` SHALL be nested under sessions: `POST /api/v1/sessions/:id/messages`, `GET /api/v1/sessions/:id/messages`
- **THEN** `report_router` SHALL have prefix `/api/v1/messages` and tags `["reports"]`

### Requirement: Python dependencies for Gemini
The backend SHALL add the `google-generativeai` SDK to requirements.

#### Scenario: New dependency
- **WHEN** `pip install -r requirements.txt` runs
- **THEN** `google-generativeai>=0.8,<1` SHALL be installed

### Requirement: Pydantic schemas for chat
The backend SHALL define Pydantic DTOs for all chat-related endpoints.

#### Scenario: Session schemas
- **THEN** `CreateSessionRequest` SHALL have optional field `topic_hint: str | None`
- **THEN** `SessionResponse` SHALL have fields: `id` (UUID), `started_at` (datetime), `ended_at` (datetime | None), `topic_hint` (str | None), `checkin_opt_in` (bool), `checkin_completed_at` (datetime | None), `avatar_used` (bool)
- **THEN** `CreateSessionResponse` SHALL extend `SessionResponse` with `previous_session_closed: bool`
- **THEN** `SessionDetailResponse` SHALL extend `SessionResponse` with `checkin_payload` (dict | None), `meta` (dict | None)

#### Scenario: Check-in schemas
- **THEN** `CheckinPayload` SHALL have fields: `mood` (int, 0-10, required), `sleep` (float | None, 0-24), `focus` (str | None), `note` (str | None, max 500 chars)
- **THEN** `UpdateSessionRequest` SHALL be a union-like schema with either `checkin_payload: CheckinPayload` or `action: Literal["end"]`

#### Scenario: Message schemas
- **THEN** `SendMessageRequest` SHALL have field `content: str` (min 1, max 2000)
- **THEN** `MessageResponse` SHALL have fields: `id` (UUID), `role` (str), `content` (str), `created_at` (datetime), `safety_flags` (dict | None)

#### Scenario: Report schemas
- **THEN** `CreateReportRequest` SHALL have fields: `reason` (Literal["hallucination","harmful","privacy","low_empathy","other"]), `severity` (int | None, 1-5), `details` (str | None, max 1000)
- **THEN** `ReportResponse` SHALL have fields: `id` (UUID), `message_id` (UUID), `reason` (str), `severity` (int | None), `details` (str | None), `status` (str), `created_at` (datetime)
- **THEN** `ReportCheckResponse` SHALL have field `already_reported: bool`
