## MODIFIED Requirements

### Requirement: FastAPI application entry point
The backend SHALL register the following additional routers with prefix `/api/v1`:
- `safety_event_router` from `app.routers.safety_event_router` (prefix: `/safety-events`, tags: `["safety-events"]`)
- `system_config_router` from `app.routers.system_config_router` (prefix: `/system-config`, tags: `["system-config"]`)

All previously registered routers (auth, consent, users, sessions, reports) SHALL remain.

#### Scenario: Routers are registered
- **WHEN** the FastAPI application starts
- **THEN** all auth, consent, users, session, report, safety-event, and system-config routers are accessible under `/api/v1/`
