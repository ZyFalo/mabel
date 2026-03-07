## ADDED Requirements

### Requirement: FastAPI application entry point
The backend SHALL have a FastAPI application at `backend/app/main.py` that can be started with Uvicorn. The application SHALL include CORS middleware configured from `CORS_ORIGINS` environment variable. The application SHALL register the following routers with prefix `/api/v1`:
- `auth_router` from `app.routers.auth_router` (prefix: `/auth`, tags: `["auth"]`)
- `consent_router` from `app.routers.consent_router` (prefix: ``, tags: `["consent"]`)
- `users_router` from `app.routers.users_router` (prefix: `/users`, tags: `["users"]`)

The health check endpoint `GET /api/v1/health` SHALL remain available.

#### Scenario: Server startup
- **WHEN** a developer runs `uvicorn app.main:app --reload` from `backend/`
- **THEN** the FastAPI server SHALL start on port 8000
- **THEN** Swagger docs SHALL be available at `http://localhost:8000/docs`

#### Scenario: Routers are registered
- **WHEN** the FastAPI application starts
- **THEN** all auth, consent, and users routers are accessible under `/api/v1/`

#### Scenario: Health check still works
- **WHEN** a GET request is sent to `/api/v1/health`
- **THEN** the response is `{ "status": "ok", "version": "0.1.0" }`

### Requirement: Backend directory structure
The backend SHALL follow a layered architecture pattern with clear separation of concerns.

#### Scenario: Directory layout
- **WHEN** the backend scaffold is created
- **THEN** the following directories SHALL exist under `backend/app/`:
  - `core/` (config, database, security utilities)
  - `models/` (SQLAlchemy models)
  - `schemas/` (Pydantic schemas — empty for now)
  - `repositories/` (data access layer — empty for now)
  - `services/` (business logic — empty for now)
  - `routers/` (API endpoints — health check only for now)
  - `middleware/` (guardrails, auth — empty for now)

### Requirement: Pydantic Settings configuration
The backend SHALL use `pydantic-settings` to load and validate environment variables.

#### Scenario: Configuration loading
- **WHEN** the application starts
- **THEN** it SHALL load `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `CORS_ORIGINS` from environment or `.env` file
- **THEN** `GEMINI_MODEL` SHALL default to `"gemini-2.5-flash"`
- **THEN** `GEMINI_TIMEOUT_MS` SHALL default to `30000`
- **THEN** `CORS_ORIGINS` SHALL default to `"http://localhost:5173"`

### Requirement: Async database session
The backend SHALL configure an async SQLAlchemy engine and session factory.

#### Scenario: Database connection
- **WHEN** the application starts
- **THEN** it SHALL create an async engine from `DATABASE_URL`
- **THEN** a `get_db` dependency SHALL provide async sessions to endpoints

### Requirement: Python dependencies
The backend SHALL use a `requirements.txt` with pinned major versions.

#### Scenario: Dependencies installable
- **WHEN** a developer runs `pip install -r requirements.txt` in `backend/`
- **THEN** all required packages SHALL install: fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg, alembic, pydantic-settings, pyjwt, bcrypt, python-dotenv

### Requirement: Ruff configuration
Ruff SHALL be configured in `backend/pyproject.toml` with project-specific rules.

#### Scenario: Ruff config
- **WHEN** `ruff check` runs
- **THEN** it SHALL enforce line-length 120, target Python 3.11, and selected rule sets (E, F, I, UP)
