## ADDED Requirements

### Requirement: Monorepo Git structure
The repository SHALL be organized as a monorepo with `backend/` and `frontend/` directories at the root level, alongside the existing documentation files.

#### Scenario: Repository initialization
- **WHEN** the project is initialized
- **THEN** Git SHALL be configured with remote `origin` pointing to `https://github.com/ZyFalo/mabel.git`
- **THEN** the directory structure SHALL contain `backend/`, `frontend/`, `db/`, `docs/`, `Mockups/`

#### Scenario: Gitignore before first commit
- **WHEN** Git is initialized
- **THEN** `.gitignore` SHALL be created BEFORE any commit, and SHALL include `.env` to prevent accidental credential leaks

#### Scenario: First commit
- **WHEN** the initial structure is committed
- **THEN** `.gitignore` and `.env.example` SHALL already exist
- **THEN** the commit SHALL include all existing documentation artifacts (CLAUDE.md, TECHSTACK.md, db/, docs/, Mockups/) plus the new code scaffold
- **THEN** `.env` SHALL NOT be included in the commit (excluded by `.gitignore`)

### Requirement: Git ignore configuration
The repository SHALL have a `.gitignore` that prevents accidental commits of secrets and build artifacts.

#### Scenario: Sensitive files excluded
- **WHEN** a developer creates a `.env` file with credentials
- **THEN** the `.env` file SHALL NOT be tracked by Git

#### Scenario: Build artifacts excluded
- **WHEN** builds run for backend or frontend
- **THEN** `__pycache__/`, `node_modules/`, `dist/`, `.venv/`, `*.pyc` SHALL NOT be tracked

### Requirement: Environment configuration template
The project SHALL include a `.env.example` file documenting all required environment variables without actual secrets.

#### Scenario: New developer setup
- **WHEN** a new developer clones the repository
- **THEN** they SHALL find `.env.example` with all required variables: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `CORS_ORIGINS`
- **THEN** `DATABASE_URL` SHALL use the placeholder: `postgresql+asyncpg://user:password@localhost:5432/mabel_ia`
- **THEN** each variable SHALL have a descriptive comment and placeholder value

### Requirement: Docker Compose configuration
The project SHALL include a `docker-compose.yml` for optional containerized development.

#### Scenario: Docker alternative for PostgreSQL
- **WHEN** a developer without local PostgreSQL runs `docker-compose up db`
- **THEN** a PostgreSQL 16 container SHALL start on port 5433 (avoiding conflict with local 5432)
- **THEN** the container SHALL use pgcrypto extension and create the `mabel_ia` database

### Requirement: Code quality tools
The project SHALL have linters configured for both Python and JavaScript.

#### Scenario: Python linting
- **WHEN** a developer runs `ruff check backend/`
- **THEN** Ruff SHALL validate Python code style with the project's rules (line-length=120, target Python 3.11+)

#### Scenario: JavaScript linting
- **WHEN** a developer runs `npm run lint` in `frontend/`
- **THEN** ESLint SHALL validate React/JSX code with Prettier formatting rules
