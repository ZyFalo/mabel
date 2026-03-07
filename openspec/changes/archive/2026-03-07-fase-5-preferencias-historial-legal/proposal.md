## Why

The student experience is incomplete after Fase 3 (Chat) and Fase 4 (Guardrails/SOS). Students cannot configure their preferences (history, accessibility, voice, check-in), manage their account (change password, delete account), exercise ARCO data rights (Ley 1581/2012), or revoke consent. The onboarding flow after first consent acceptance is also missing — students go straight to Home without setting up their preferences. These are required for HU-04, HU-09, HU-10, HU-11 and legal compliance.

## What Changes

- **Onboarding stepper** (#07): 3-step flow (Privacidad, Accesibilidad, Voz) after first consent, creates initial `preferences` record
- **Preferences page** (#15): Full settings page with 5 sections (Privacidad, Accesibilidad, Voz, Cuenta, Mis Datos ARCO)
- **Change password** (#42): PUT `/api/v1/auth/change-password` with current password verification
- **Delete account** (#16): DELETE `/api/v1/users/me` — hard DELETE + CASCADE (D-14), requires typing "ELIMINAR"
- **Export data ARCO** (#40): GET `/api/v1/users/me/export?format=json|csv` — account, consent, preferences, usage stats
- **Consent revocation** (#17): Two flows — reduce scope (PATCH scope) or revoke totally (PATCH action:"revoke", logout, redirect)
- **Preferences API**: GET `/api/v1/preferences/me` (404 if not exists → redirect to onboarding), PUT `/api/v1/preferences` (create or update)
- **#13 Historial de Sesiones**: DEPRECATED — already integrated in Sidebar #34B (Fase 3). No new work needed.

## Capabilities

### New Capabilities
- `preferences-backend`: CRUD preferences (PUT /api/v1/preferences), onboarding check (GET /api/v1/preferences/me), PreferenceRepository extensions (create, update), PreferenceService
- `account-backend`: Account deletion (DELETE /api/v1/users/me, hard DELETE + CASCADE + SET NULL), change password (PUT /api/v1/auth/change-password), export ARCO data (GET /api/v1/users/me/export?format=json|csv)
- `consent-revocation-backend`: Two revocation flows for #17 — reduce scope (PATCH scope="solo_uso") and revoke totally (PATCH action="revoke", SET revoked_at). Extends existing consent_service.patch_consent.
- `preferences-frontend`: Onboarding stepper (#07, 3 steps), Preferences page (#15, 5 sections), Delete Account modal (#16), Revoke Consent modal (#17), ARCO Export modal (#40), Change Password modal (#42)

### Modified Capabilities
- `backend-scaffold`: Add preferences_router to main.py, extend users_router with delete account and export endpoints
- `auth-backend`: Add change-password endpoint to auth_router

## Impact

- **Backend**: New files — `schemas/preferences.py`, `services/preference_service.py`, `services/account_service.py`, `routers/preference_router.py`. Modified — `repositories/preference_repository.py` (add create/update), `repositories/user_repository.py` (add delete), `services/consent_service.py` (add revoke action), `routers/auth_router.py` (add change-password), `routers/users_router.py` (add delete + export), `main.py` (add preference_router)
- **Frontend**: New files — `pages/Onboarding.tsx`, `pages/Settings.tsx`, `components/settings/DeleteAccountModal.tsx`, `components/settings/RevokeConsentModal.tsx`, `components/settings/ArcoExportModal.tsx`, `components/settings/ChangePasswordModal.tsx`, `stores/preferencesStore.ts`. Modified — `App.tsx` (add /onboarding and /settings routes), `guards/ConsentGuard.tsx` (redirect to onboarding if no preferences)
- **APIs**: 6 new/modified endpoints
- **Legal compliance**: Ley 1581/2012 (ARCO rights, consent revocation, account deletion)
