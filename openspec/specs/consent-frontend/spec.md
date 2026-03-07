## ADDED Requirements

### Requirement: Consent page (#06)
The system SHALL render a consent page at route `/consent` (authenticated). On mount, it SHALL call `GET /api/v1/consent-versions/active` to load the active consent version dynamically. The page SHALL display: title "Consentimiento Informado", a version badge (from `consent_versions.version`), the full legal text from `consent_versions.body` in a scrollable read-only area, a purpose section, an ARCO rights section, a scope selector (radio buttons: "Solo uso" / "Uso + mejora anonima"), an acceptance checkbox ("He leido y acepto el consentimiento informado"), an "Aceptar y continuar" primary button (disabled until checkbox is checked AND scope is selected AND scroll has reached the end), and a "Rechazar" secondary button.

The acceptance checkbox SHALL remain disabled until the user scrolls to the end of the legal text area. A scroll indicator SHALL visually show scroll progress and that the user must read the full text before accepting.

#### Scenario: First-time acceptance
- **WHEN** a student with no prior consent views the page, scrolls to the end, selects scope, checks the checkbox, and clicks "Aceptar y continuar"
- **THEN** `POST /api/v1/consents` is called with `{ consent_version_id, scope }`, and on success (HTTP 201) the user is redirected based on preferences state

#### Scenario: Re-acceptance after revocation
- **WHEN** a student with a revoked consent (`revoked_at IS NOT NULL`) views the page, scrolls to the end, selects scope, and accepts
- **THEN** `PATCH /api/v1/consents/current` is called with `{ action: "re-accept", scope }`, the backend updates the existing record (HTTP 200), and the user is redirected to `/home`

#### Scenario: New version acceptance
- **WHEN** a student whose consent version is outdated views the page
- **THEN** the page loads the new active version, and on acceptance `POST /api/v1/consents` creates a new row (different `consent_version_id`)

#### Scenario: Reject consent
- **WHEN** the student clicks "Rechazar"
- **THEN** the user is redirected to `/consent/rejected`

#### Scenario: Scroll required before checkbox
- **WHEN** the user has NOT scrolled to the end of the legal text area
- **THEN** the acceptance checkbox is disabled and cannot be checked

#### Scenario: Button disabled until all conditions met
- **WHEN** the checkbox is unchecked OR no scope is selected OR scroll has not reached the end
- **THEN** the "Aceptar y continuar" button is disabled

#### Scenario: Post-acceptance redirect is conditional
- **WHEN** consent is accepted successfully
- **THEN** the page calls `GET /api/v1/preferences/me`. If HTTP 404 (no preferences record) → redirect to `/onboarding/preferences`. If HTTP 200 → redirect to `/home`. In Fase 2, `/onboarding/preferences` does not exist yet, so a placeholder route SHALL redirect to `/home`.

#### Scenario: No active consent version available
- **WHEN** `GET /api/v1/consent-versions/active` returns HTTP 404
- **THEN** the page shows message "No hay una version de consentimiento disponible. Contacta al equipo de investigacion." with a "Cerrar sesion" button that logs out

### Requirement: Consent required page (#22)
The system SHALL render a consent-required page at route `/consent-required` (authenticated). On mount, it SHALL call `GET /api/v1/users/me/consent-status` to determine which variant to display. The page SHALL NOT have a sidebar (centered layout).

**Variant A — New user (no_consent):**
- Welcome message explaining the need for consent
- Button "Ir al consentimiento" → `/consent`

**Variant B — Revoked (revoked):**
- Message that consent was revoked and access is temporarily blocked
- Explanation that re-acceptance is possible
- Button "Re-aceptar consentimiento" → `/consent`
- Button "Cerrar sesion" → logout

**Variant C — New version required (new_version_required):**
- Message about new consent version
- Shows previous version and new version identifiers
- Button "Revisar nueva version" → `/consent`
- Button "Cerrar sesion" → logout

#### Scenario: Variant A renders for new user
- **WHEN** consent-status returns `{ status: "no_consent" }`
- **THEN** variant A renders with welcome message and "Ir al consentimiento" button

#### Scenario: Variant B renders for revoked consent
- **WHEN** consent-status returns `{ status: "revoked" }`
- **THEN** variant B renders with revocation message, "Re-aceptar" and "Cerrar sesion" buttons

#### Scenario: Variant C renders for outdated version
- **WHEN** consent-status returns `{ status: "new_version_required", current_version: "1.0", new_version: "2.0" }`
- **THEN** variant C renders showing both versions and "Revisar nueva version" button

#### Scenario: Logout button works
- **WHEN** the user clicks "Cerrar sesion" in variants B or C
- **THEN** the auth store is cleared and user is redirected to `/`

### Requirement: Consent rejected page (#41)
The system SHALL render a consent rejection page at route `/consent/rejected` (authenticated) with: title "Consentimiento no aceptado", explanation referencing Ley 1581/2012, a list of benefits of accepting, a "Volver a revisar el consentimiento" button navigating to `/consent`, a "Cerrar sesion" button that logs out, and help text with team contact info.

#### Scenario: Student sees rejection page
- **WHEN** a student who rejected consent views `/consent/rejected`
- **THEN** the page renders with explanation, benefits list, and both action buttons

#### Scenario: Retry consent
- **WHEN** the student clicks "Volver a revisar el consentimiento"
- **THEN** they are navigated to `/consent`

#### Scenario: Logout from rejection
- **WHEN** the student clicks "Cerrar sesion"
- **THEN** the auth store is cleared and user is redirected to `/`

### Requirement: Consent guard
The system SHALL implement a `ConsentGuard` component in `frontend/src/guards/ConsentGuard.tsx` that wraps routes requiring active consent. On mount, it SHALL call `GET /api/v1/users/me/consent-status`. If the status is NOT `"ok"`, it SHALL redirect to `/consent-required`. The consent and consent-related routes (`/consent`, `/consent-required`, `/consent/rejected`) SHALL NOT be wrapped by this guard.

#### Scenario: User without consent accesses protected route
- **WHEN** a student with `consent_status != "ok"` tries to access `/home`
- **THEN** they are redirected to `/consent-required`

#### Scenario: User with valid consent proceeds
- **WHEN** a student with `consent_status == "ok"` accesses `/home`
- **THEN** the guard passes through and the route renders normally

#### Scenario: Consent routes are not guarded
- **WHEN** a student navigates to `/consent` or `/consent-required`
- **THEN** the ConsentGuard does NOT intercept these routes
