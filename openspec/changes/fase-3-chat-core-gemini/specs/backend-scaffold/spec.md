## MODIFIED Requirements

### Requirement: FastAPI application entry point
The backend SHALL have a FastAPI application at `backend/app/main.py` that can be started with Uvicorn. The application SHALL include CORS middleware configured from `CORS_ORIGINS` environment variable. The application SHALL register the following routers with prefix `/api/v1`:
- `auth_router` from `app.routers.auth_router` (prefix: `/auth`, tags: `["auth"]`)
- `consent_router` from `app.routers.consent_router` (prefix: ``, tags: `["consent"]`)
- `users_router` from `app.routers.users_router` (prefix: `/users`, tags: `["users"]`)
- `session_router` from `app.routers.session_router` (prefix: `/sessions`, tags: `["sessions"]`)
- `report_router` from `app.routers.report_router` (prefix: `/messages`, tags: `["reports"]`)

The health check endpoint `GET /api/v1/health` SHALL remain available.

#### Scenario: Server startup
- **WHEN** a developer runs `uvicorn app.main:app --reload` from `backend/`
- **THEN** the FastAPI server SHALL start on port 8000
- **THEN** Swagger docs SHALL be available at `http://localhost:8000/docs`

#### Scenario: Routers are registered
- **WHEN** the FastAPI application starts
- **THEN** all auth, consent, users, session, and report routers are accessible under `/api/v1/`

#### Scenario: Health check still works
- **WHEN** a GET request is sent to `/api/v1/health`
- **THEN** the response is `{ "status": "ok", "version": "0.1.0" }`

### Requirement: Python dependencies
The backend SHALL use a `requirements.txt` with pinned major versions.

#### Scenario: Dependencies installable
- **WHEN** a developer runs `pip install -r requirements.txt` in `backend/`
- **THEN** all required packages SHALL install: fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg, alembic, pydantic-settings, pyjwt, bcrypt, python-multipart, python-dotenv, google-generativeai
