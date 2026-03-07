## ADDED Requirements

### Requirement: Onboarding page with 3-step stepper
The frontend SHALL implement a 3-step onboarding page at /onboarding with steps Privacidad, Accesibilidad, and Voz.

#### Scenario: Complete onboarding flow
- **WHEN** student fills all 3 steps and clicks "Empezar"
- **THEN** it SHALL call PUT /api/v1/preferences with collected values, show toast, and navigate to /home

#### Scenario: Skip onboarding
- **WHEN** student clicks "Omitir" on any step
- **THEN** it SHALL call PUT /api/v1/preferences with empty body (DB defaults) and navigate to /home

#### Scenario: Step navigation preserves state
- **WHEN** student clicks "Anterior" on Step 2
- **THEN** it SHALL return to Step 1 with previously entered values preserved

### Requirement: Settings page with 5 sections
The frontend SHALL implement a settings page at /settings with sections Privacidad, Accesibilidad, Voz, Cuenta, and Mis Datos ARCO.

#### Scenario: Update privacy settings
- **WHEN** student toggles save_history and clicks "Guardar"
- **THEN** it SHALL call PUT /api/v1/preferences with the updated value and show toast

#### Scenario: Open account modals
- **WHEN** student clicks "Cambiar contrasena" or "Eliminar cuenta"
- **THEN** the respective modal SHALL open

#### Scenario: Load existing preferences
- **WHEN** student navigates to /settings
- **THEN** all form fields SHALL be populated from preferencesStore

### Requirement: Delete Account Modal
The modal SHALL require typing "ELIMINAR" to confirm and call DELETE /api/v1/users/me.

#### Scenario: Successful deletion
- **WHEN** user types "ELIMINAR" and clicks delete button
- **THEN** it SHALL call DELETE /api/v1/users/me, clear localStorage, and navigate to "/"

#### Scenario: Button disabled until correct input
- **WHEN** input does not match "ELIMINAR" exactly
- **THEN** the delete button SHALL be disabled

### Requirement: Revoke Consent Modal
The modal SHALL offer two options: reduce scope and revoke totally.

#### Scenario: Reduce scope
- **WHEN** student clicks reduce scope option (visible only if currentScope is "uso_mejora_anon")
- **THEN** it SHALL call PATCH /api/v1/consents/current with action "reduce-scope", show toast, and close

#### Scenario: Revoke totally
- **WHEN** student clicks revoke option
- **THEN** it SHALL call PATCH with action "revoke", clear auth, and navigate to /consent-required

#### Scenario: Option 1 hidden when already solo_uso
- **WHEN** currentScope is "solo_uso"
- **THEN** only the revoke option SHALL be visible

### Requirement: ARCO Export Modal
The modal SHALL show a data preview and offer JSON/CSV download buttons.

#### Scenario: View data preview
- **WHEN** modal opens
- **THEN** it SHALL fetch GET /api/v1/users/me/export?format=json and display account, consent, preferences, and usage stats

#### Scenario: Download JSON file
- **WHEN** user clicks "Descargar JSON"
- **THEN** it SHALL trigger browser download of mabel-datos.json

#### Scenario: Download CSV file
- **WHEN** user clicks "Descargar CSV"
- **THEN** it SHALL call GET /api/v1/users/me/export?format=csv and trigger download of mabel-datos.csv

### Requirement: Change Password Modal
The modal SHALL accept current password, new password with strength indicator, and confirm password.

#### Scenario: Successful password change
- **WHEN** all fields are valid and user clicks "Cambiar"
- **THEN** it SHALL call PUT /api/v1/auth/change-password, show toast, and close modal

#### Scenario: Wrong current password
- **WHEN** API returns 401
- **THEN** it SHALL show error "Contrasena actual incorrecta"

#### Scenario: Passwords must match
- **WHEN** new password and confirm password differ
- **THEN** the button SHALL be disabled and mismatch error SHALL be shown

### Requirement: Preferences Zustand store
The store SHALL manage preferences state with loadPreferences, updatePreferences, and hasPreferences.

#### Scenario: Load preferences on init
- **WHEN** loadPreferences is called
- **THEN** it SHALL GET /api/v1/preferences/me and set store.preferences (or null on 404)

#### Scenario: hasPreferences computed from state
- **WHEN** store.preferences is null
- **THEN** hasPreferences SHALL return false

### Requirement: OnboardingGuard route guard
The guard SHALL redirect to /onboarding if preferences do not exist.

#### Scenario: No preferences redirects to onboarding
- **WHEN** hasPreferences is false and user navigates to a protected route
- **THEN** it SHALL redirect to /onboarding

#### Scenario: Has preferences passes through
- **WHEN** hasPreferences is true
- **THEN** it SHALL render child routes normally

### Requirement: App routing changes for onboarding and settings
App.tsx SHALL add /onboarding and /settings routes inside StudentLayout.

#### Scenario: Route structure
- **WHEN** routes are configured
- **THEN** /onboarding SHALL be inside ConsentGuard but outside OnboardingGuard
- **THEN** /settings and other student routes SHALL be inside both ConsentGuard and OnboardingGuard
