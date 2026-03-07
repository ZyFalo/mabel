## Tasks

### Group: preferences-backend
Spec: preferences-backend

- [x] T-01: Create `backend/app/schemas/preferences.py` — UpdatePreferencesRequest (all fields Optional, preferred_chat_mode Literal["chat","avatar"]) and PreferencesResponse (from_attributes)
- [x] T-02: Extend `backend/app/repositories/preference_repository.py` — add `create(user_id, **kwargs)` and `update(preference, **kwargs)` methods
- [x] T-03: Create `backend/app/services/preference_service.py` — PreferenceService with `get_preferences(user_id)` and `upsert_preferences(user_id, data)` (create-or-update pattern)
- [x] T-04: Create `backend/app/routers/preference_router.py` — GET /preferences/me (404 if not found) and PUT /preferences (upsert). Both require_role("student")

### Group: account-backend
Spec: account-backend

- [x] T-05: Add `ChangePasswordRequest` to `backend/app/schemas/auth.py` — current_password + new_password with same validation as RegisterRequest
- [x] T-06: Add `DeleteAccountRequest` and `ExportFormatEnum` to `backend/app/schemas/preferences.py` — confirmation validator == "ELIMINAR"
- [x] T-07: Extend `backend/app/repositories/user_repository.py` — add `delete(user_id) -> bool` method
- [x] T-08: Create `backend/app/services/account_service.py` — AccountService with `delete_account(user_id, confirmation)`, `change_password(user, current_password, new_password)`, `export_data(user_id, format)`
- [x] T-09: Extend `backend/app/routers/users_router.py` — add DELETE /users/me and GET /users/me/export endpoints
- [x] T-10: Extend `backend/app/routers/auth_router.py` — add PUT /auth/change-password endpoint

### Group: consent-revocation-backend
Spec: consent-revocation-backend

- [x] T-11: Extend `ConsentActionEnum` in `backend/app/schemas/consent.py` — add `reduce_scope = "reduce-scope"` and `revoke = "revoke"`
- [x] T-12: Extend `patch_consent` in `backend/app/services/consent_service.py` — add "reduce-scope" branch (check scope, set solo_uso) and "revoke" branch (set revoked_at = NOW())
- [x] T-13: Extend error handlers in `backend/app/routers/consent_router.py` — add ALREADY_SOLO_USO, CONSENT_REVOKED, ALREADY_REVOKED (all 409)

### Group: backend-scaffold
Spec: backend-scaffold

- [x] T-14: Register preference_router in `backend/app/main.py` — import and app.include_router

### Group: preferences-frontend
Spec: preferences-frontend

- [x] T-15: Create `frontend/src/stores/preferencesStore.ts` — Zustand store with loadPreferences (GET /preferences/me, 404→null), updatePreferences (PUT /preferences), hasPreferences computed
- [x] T-16: Create `frontend/src/pages/Onboarding.tsx` — 3-step stepper (#07): Step 1 Privacidad (save_history, checkin_enabled), Step 2 Accesibilidad (contrast, font_size, subtitles), Step 3 Voz (tts_voice, preferred_chat_mode). "Omitir" sends defaults, "Empezar" sends collected values. PUT /api/v1/preferences → navigate /home
- [x] T-17: Create `frontend/src/pages/Settings.tsx` — 5-section settings page (#15): Privacidad, Accesibilidad, Voz, Cuenta, Mis Datos ARCO. Per-section "Guardar" via PUT /preferences. Account section opens modals #16/#17/#42. ARCO section opens #40
- [x] T-18: Create `frontend/src/components/settings/DeleteAccountModal.tsx` — #16: warning, "ELIMINAR" input, danger button, DELETE /api/v1/users/me → clear auth → navigate "/"
- [x] T-19: Create `frontend/src/components/settings/RevokeConsentModal.tsx` — #17: two option cards (reduce scope / revoke totally). Option 1 PATCH reduce-scope → toast → close. Option 2 PATCH revoke → clear auth → /consent-required
- [x] T-20: Create `frontend/src/components/settings/ArcoExportModal.tsx` — #40: data preview from GET /users/me/export, download JSON/CSV buttons via Blob + anchor
- [x] T-21: Create `frontend/src/components/settings/ChangePasswordModal.tsx` — #42: current password, new password with strength indicator, confirm, PUT /auth/change-password
- [x] T-22: Create `frontend/src/guards/OnboardingGuard.tsx` — checks preferencesStore.hasPreferences, redirects to /onboarding if false (except when already on /onboarding)
- [x] T-23: Update `frontend/src/App.tsx` — add /onboarding and /settings routes inside StudentLayout, wrap post-onboarding routes with OnboardingGuard, import new pages
