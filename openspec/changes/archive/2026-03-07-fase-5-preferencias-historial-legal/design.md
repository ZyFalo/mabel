## Design Decisions

### D-01: Preferences create-or-update pattern
The `PUT /api/v1/preferences` endpoint uses upsert semantics: if the row doesn't exist (first time after onboarding), it creates it; if it exists, it updates. This simplifies the frontend — both onboarding (#07) and settings (#15) use the same endpoint. The `GET /api/v1/preferences/me` returns 404 when no record exists, which the frontend uses to detect "needs onboarding".

### D-02: Onboarding guard in ConsentGuard
After consent acceptance, the ConsentGuard (or a new OnboardingGuard) checks if preferences exist via `GET /api/v1/preferences/me`. If 404 → redirect to `/onboarding`. This ensures first-time users always go through onboarding before accessing the app. The check is lightweight (single DB lookup by PK).

### D-03: Hard DELETE implementation (D-14)
Account deletion executes `DELETE FROM users WHERE id = ?` which triggers CASCADE on 7 FK chains (consents, preferences, sessions→messages→message_reports/attachments, password_reset_tokens) and SET NULL on 6 FKs (consent_versions.created_by, audit_logs.admin_id, survey_responses.user_id/imported_by, system_config.updated_by, safety_events.user_id). The endpoint requires the request body to contain `{ confirmation: "ELIMINAR" }` for safety. After deletion, the response is 200 with a message, and the frontend clears auth state and redirects to landing.

### D-04: ARCO export content
GET `/api/v1/users/me/export?format=json|csv` collects: user account data (email, display_name, created_at), active consent (scope, accepted_at, version), preferences (all 7 columns), usage statistics (total sessions, total messages, total reports). It does NOT include message content (privacy — messages may contain sensitive information). The JSON format returns a structured object; CSV returns a flat key-value table.

### D-05: Consent revocation extends existing patch_consent
The existing `PATCH /api/v1/consents/current` already handles `action: "re-accept"`. We add two new actions to ConsentService.patch_consent:
- `action: "reduce-scope"` → sets scope to "solo_uso" (only valid if current scope is "uso_mejora_anon" and consent is active)
- `action: "revoke"` → sets revoked_at = NOW() server-side
The PatchConsentRequest schema adds these actions to the ConsentActionEnum. Frontend #17 calls the same PATCH endpoint with different payloads.

### D-06: Change password flow
PUT `/api/v1/auth/change-password` accepts `{ current_password, new_password }`. The service verifies current_password against the stored hash using bcrypt. New password must pass the same validation rules as registration (min 8 chars, 1 uppercase, 1 number, 1 special). New password must differ from current. On success, updates the hash and returns 200.

### D-07: Onboarding stepper state management
The 3-step onboarding (#07) is a single page component with local React state tracking the current step (0, 1, 2). Steps: Privacidad (save_history, checkin_enabled), Accesibilidad (contrast, font_size, subtitles), Voz (tts_voice, preferred_chat_mode). All values are collected in a local form state, then sent as a single PUT on completion. The "Omitir" (skip) button sends defaults immediately.

### D-08: Settings page section layout
The Settings page (#15) uses collapsible sections or tabs for the 5 areas: Privacidad, Accesibilidad, Voz, Cuenta, Mis Datos ARCO. Changes are saved via PUT `/api/v1/preferences` on a per-section "Guardar" button. Account actions (change password, revocation, deletion) open modals (#42, #17, #16) respectively. ARCO opens modal #40.

### D-09: Preferences store
A new Zustand store `preferencesStore` manages: loading preferences on app init, caching locally, providing `hasPreferences` boolean for onboarding detection, and `updatePreferences` action. The store calls `GET /api/v1/preferences/me` and stores the result. Components read from the store instead of making individual API calls.

### D-10: #13 Historial DEPRECATED confirmation
Interface #13 (Historial de Sesiones) is deprecated and fully integrated into Sidebar #34B (implemented in Fase 3). HU-12 (view sessions) is covered by the sidebar session list. HU-13 (delete session) is covered by #14 (SessionDetail) with confirmation modal #37. No new work needed for this interface.

## Alternatives Considered

- **Soft delete for accounts**: Rejected for MVP (D-14 decision). Hard DELETE simplifies implementation. `deleted_at` column reserved for post-MVP grace period.
- **Separate onboarding API endpoint**: Rejected. Using the same PUT /preferences for both onboarding and settings reduces code duplication.
- **Include message content in ARCO export**: Rejected for privacy. Messages may contain sensitive emotional content. Export includes statistics only.
