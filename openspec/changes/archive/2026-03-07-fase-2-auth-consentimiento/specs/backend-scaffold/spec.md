## MODIFIED Requirements

### Requirement: FastAPI application entry point
The backend SHALL have a FastAPI application at `backend/app/main.py` that can be started with Uvicorn. The application SHALL include CORS middleware configured from `CORS_ORIGINS` environment variable. The application SHALL register the following routers with prefix `/api/v1`:
- `auth_router` from `app.routers.auth_router` (prefix: `/auth`, tags: `["auth"]`)
- `consent_router` from `app.routers.consent_router` (prefix: ``, tags: `["consent"]`)
- `users_router` from `app.routers.users_router` (prefix: `/users`, tags: `["users"]`)

The health check endpoint `GET /api/v1/health` SHALL remain available.

#### Scenario: Routers are registered
- **WHEN** the FastAPI application starts
- **THEN** all auth, consent, and users routers are accessible under `/api/v1/`

#### Scenario: Health check still works
- **WHEN** a GET request is sent to `/api/v1/health`
- **THEN** the response is `{ "status": "ok", "version": "0.1.0" }`
