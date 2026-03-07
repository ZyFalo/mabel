## ADDED Requirements

### Requirement: Get active consent version endpoint
The system SHALL expose `GET /api/v1/consent-versions/active` (authenticated) that returns the currently active consent version. The query SHALL filter `consent_versions WHERE status = 'active'`. There MUST be exactly one active version at any time.

#### Scenario: Active version exists
- **WHEN** an authenticated request is sent and a consent_version with `status='active'` exists
- **THEN** the response is HTTP 200 with `{ id, version, title, body, status, published_at, created_at }`

#### Scenario: No active version
- **WHEN** no consent_version has `status='active'`
- **THEN** the response is HTTP 404 with `{ detail: "No hay version de consentimiento activa" }`

### Requirement: Accept consent endpoint (first-time or new version)
The system SHALL expose `POST /api/v1/consents` (authenticated, student) that creates a NEW consent record. The request body SHALL include `consent_version_id` (UUID, required) and `scope` (string, required, one of `'solo_uso'` or `'uso_mejora_anon'`). This endpoint is used ONLY for first-time acceptance or acceptance of a new consent version (different `consent_version_id`). If a record already exists for the same `(user_id, consent_version_id)`, the endpoint SHALL return HTTP 409 regardless of revocation status (re-acceptance uses PATCH).

#### Scenario: First-time consent acceptance
- **WHEN** a student sends POST with valid `consent_version_id` and `scope='solo_uso'` and no prior consent for that version exists
- **THEN** a new row is inserted into `consents` with `user_id` (from JWT), `consent_version_id`, `scope`, `accepted_at=CURRENT_TIMESTAMP`, `revoked_at=NULL`, and the response is HTTP 201

#### Scenario: New version acceptance
- **WHEN** a student sends POST with a `consent_version_id` different from any existing consent record
- **THEN** a new row is inserted (different `consent_version_id`), and the response is HTTP 201

#### Scenario: Duplicate consent for same version
- **WHEN** a student sends POST with `consent_version_id` matching an existing record (active or revoked)
- **THEN** the response is HTTP 409 with `{ detail: "Ya existe un registro para esta version. Usa PATCH para re-aceptar." }`

#### Scenario: Invalid consent version
- **WHEN** POST is sent with a `consent_version_id` that does not exist or is not `'active'`
- **THEN** the response is HTTP 404 with `{ detail: "Version de consentimiento no encontrada o no esta activa" }`

#### Scenario: Invalid scope value
- **WHEN** POST is sent with `scope` not in `('solo_uso', 'uso_mejora_anon')`
- **THEN** the response is HTTP 422 with validation error

### Requirement: Re-accept or modify consent endpoint
The system SHALL expose `PATCH /api/v1/consents/current` (authenticated, student) that modifies the current user's consent for the active consent version. The `current` path segment is a virtual resource resolving to the user's consent matching the active `consent_version`. The request body SHALL include `action` (string, required) and optionally `scope`. Supported actions in Fase 2:
- `action: "re-accept"` with `scope` (required): Sets `revoked_at=NULL`, updates `scope` and `accepted_at=CURRENT_TIMESTAMP`. Only valid if the existing consent has `revoked_at IS NOT NULL`.

Future actions (Fase 5): `action: "revoke"` and scope-only changes.

#### Scenario: Re-acceptance after revocation
- **WHEN** a student sends PATCH with `{ action: "re-accept", scope: "solo_uso" }` and their consent for the active version has `revoked_at IS NOT NULL`
- **THEN** the existing row is updated: `revoked_at=NULL`, `scope` updated, `accepted_at=CURRENT_TIMESTAMP`, and the response is HTTP 200

#### Scenario: Re-accept when not revoked
- **WHEN** a student sends PATCH with `action: "re-accept"` but their consent has `revoked_at IS NULL`
- **THEN** the response is HTTP 409 with `{ detail: "El consentimiento ya esta activo" }`

#### Scenario: No consent exists for current version
- **WHEN** a student sends PATCH but has no consent record for the active version
- **THEN** the response is HTTP 404 with `{ detail: "No existe consentimiento para la version activa. Usa POST para aceptar." }`

#### Scenario: Unsupported action
- **WHEN** a student sends PATCH with an action other than `"re-accept"`
- **THEN** the response is HTTP 422 with `{ detail: "Accion no soportada" }`

### Requirement: Get user consent status endpoint
The system SHALL expose `GET /api/v1/users/me/consent-status` (authenticated) that returns the consent status of the current user. The system SHALL:
1. Get the active `consent_version` (status='active').
2. Query `consents` for the user, ordered by `accepted_at DESC`.
3. Determine status:
   - No consent record at all → `"no_consent"`
   - Latest consent has `revoked_at IS NOT NULL` → `"revoked"`
   - Latest consent's `consent_version_id` does not match the active version → `"new_version_required"`
   - Latest consent is active and matches current version → `"ok"`

#### Scenario: User has never accepted consent
- **WHEN** no row exists in `consents` for the authenticated user
- **THEN** the response is HTTP 200 with `{ status: "no_consent" }`

#### Scenario: User has revoked consent
- **WHEN** the latest consent for the user has `revoked_at IS NOT NULL`
- **THEN** the response is HTTP 200 with `{ status: "revoked" }`

#### Scenario: New consent version available
- **WHEN** the latest active consent's `consent_version_id` does not match the current active `consent_versions` row
- **THEN** the response is HTTP 200 with `{ status: "new_version_required", current_version, new_version }`

#### Scenario: Consent is valid and current
- **WHEN** the latest consent is active (`revoked_at IS NULL`) and its `consent_version_id` matches the active version
- **THEN** the response is HTTP 200 with `{ status: "ok" }`

### Requirement: Consent guard dependency
The system SHALL provide a FastAPI dependency `require_consent` that checks the authenticated user's consent status. If the status is NOT `"ok"`, it SHALL raise HTTP 403 with `{ detail: "Consentimiento requerido", consent_status: "<status>" }`. This dependency SHALL be applied to all student-facing protected routes (except auth and consent endpoints themselves).

#### Scenario: Valid consent
- **WHEN** the authenticated user has `consent_status == "ok"`
- **THEN** the dependency passes through and the route proceeds

#### Scenario: No consent
- **WHEN** the authenticated user has no consent or revoked consent or outdated version
- **THEN** the dependency raises HTTP 403 with the consent status detail

### Requirement: Consent repository layer
The system SHALL implement `ConsentRepository` in `backend/app/repositories/consent_repository.py` that provides: `get_by_user_and_version(user_id, consent_version_id)`, `get_latest_by_user(user_id)`, `create(data)`, `update(consent_id, data)`.

#### Scenario: Repository uses async session
- **WHEN** any repository method is called
- **THEN** it executes queries asynchronously using the injected `AsyncSession`

### Requirement: Consent version repository layer
The system SHALL implement `ConsentVersionRepository` in `backend/app/repositories/consent_version_repository.py` that provides: `get_active()`, `get_by_id(id)`.

#### Scenario: get_active leverages partial index
- **WHEN** `get_active` is called
- **THEN** the query filters by `status = 'active'`, leveraging `idx_consent_versions_active`

### Requirement: Consent service layer
The system SHALL implement `ConsentService` in `backend/app/services/consent_service.py` that orchestrates consent acceptance, status checking, and re-acceptance logic, using `ConsentRepository` and `ConsentVersionRepository`.

#### Scenario: Service handles re-acceptance logic
- **WHEN** `accept_consent` is called and a revoked consent exists for the same version
- **THEN** the service updates the existing record instead of inserting a new one

### Requirement: Pydantic schemas for consent
The system SHALL define Pydantic schemas in `backend/app/schemas/consent.py`: `AcceptConsentRequest` (consent_version_id, scope), `PatchConsentRequest` (action, scope?), `ConsentStatusResponse` (status, current_version?, new_version?), `ConsentVersionResponse` (id, version, title, body, status, published_at, created_at), `ConsentResponse` (id, user_id, scope, accepted_at, revoked_at, consent_version_id).

#### Scenario: Schema validation
- **WHEN** a request body does not match the schema
- **THEN** FastAPI returns HTTP 422 with field-level validation errors

### Requirement: Seed data for consent version
The system SHALL include an Alembic data migration that inserts a seed `consent_version` with `status='active'`, a `version` identifier (e.g., "1.0"), a `title`, and the `body` text (placeholder text referencing Ley 1581/2012). This seed is necessary for the consent flow to function during development and testing.

#### Scenario: Seed exists after migration
- **WHEN** the seed migration is applied
- **THEN** `consent_versions` contains exactly 1 row with `status='active'`
