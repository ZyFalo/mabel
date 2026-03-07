## Tasks

### Group 1: Backend — Pydantic Schemas
- [x] Create `backend/app/schemas/guardrails.py` with: `CreateSafetyEventRequest` (event_type Literal, payload dict, session_id optional UUID), `SafetyEventResponse` (from_attributes), `SosConfigResponse` (hotline_numbers list[dict], guardrails_enabled bool)

### Group 2: Backend — Repositories
- [x] Create `backend/app/repositories/safety_event_repository.py` with `SafetyEventRepository` (create)
- [x] Create `backend/app/repositories/system_config_repository.py` with `SystemConfigRepository` (lazy-load cache, get_value, get_safety_keywords, get_sos_threshold, get_guardrails_enabled, get_sos_hotline_numbers)

### Group 3: Backend — GuardrailsService
- [x] Create `backend/app/services/guardrails_service.py` with `GuardrailsService`: pre_filter (keyword match, severity calc, safety_event creation), post_filter (same logic on assistant response)

### Group 4: Backend — Routers
- [x] Create `backend/app/routers/safety_event_router.py` with: POST /safety-events (201)
- [x] Create `backend/app/routers/system_config_router.py` with: GET /system-config/sos

### Group 5: Backend — Chat integration
- [x] Modify `backend/app/services/chat_service.py`: inject GuardrailsService, call pre_filter before LLM, call post_filter after streaming, include risk_detected in SSE events, populate safety_flags on persisted messages
- [x] Modify `backend/app/routers/session_router.py`: pass GuardrailsService dependency to ChatService

### Group 6: Backend — Main.py + Seed
- [x] Register `safety_event_router` and `system_config_router` in `backend/app/main.py`
- [x] Create Alembic migration `seed_system_config_operational_keys`: INSERT 4 keys (sos_hotline_numbers, safety_keywords, sos_severity_threshold, guardrails_enabled) with ON CONFLICT DO NOTHING, downgrade DELETEs

### Group 7: Frontend — SOS Panel
- [x] Create `frontend/src/components/sos/SosPanel.tsx` (#12): overlay, title "Estamos aqui para ayudarte", empathetic message, hotline buttons with tel: links loaded from GET /system-config/sos, "Volver al chat" button, close button
- [x] Modify `frontend/src/components/ui/SosFab.tsx`: replace toast placeholder with real SosPanel open + POST safety-events (redirect_shown, trigger: "manual")

### Group 8: Frontend — Error Handling
- [x] Create `frontend/src/components/ui/ConnectionError.tsx` (#20): inline error with disconnection icon, "Sin conexion" title, retry button, auto-retry with exponential backoff (3s, 6s, 12s, 24s, cap 30s), countdown timer
- [x] Create `frontend/src/components/ui/SessionExpiredModal.tsx` (#21): blocking overlay modal, "Sesion expirada" title, "Ir al login" button, saves draft to localStorage before redirect
- [x] Modify `frontend/src/api/client.ts`: on 401 intercept, save mabel_draft to localStorage before clearing auth, show SessionExpiredModal instead of immediate redirect

### Group 9: Frontend — Chat Integration
- [x] Modify `frontend/src/pages/Chat.tsx`: handle risk_detected flag in SSE events (both first event and done event), auto-open SosPanel, restore draft from localStorage on mount, stop audio on auto SOS
- [x] Modify `frontend/src/stores/chatStore.ts`: handle risk_detected in SSE parsing, expose riskDetected state, clearRisk action
- [x] Modify `frontend/src/App.tsx`: add SessionExpiredModal as global component via SessionExpiredHandler

### Verification
- [x] Run `npx openspec validate fase-4-guardrails-sos` and confirm no errors
- [x] Verify POST /api/v1/safety-events and GET /api/v1/system-config/sos endpoints are covered
- [x] Verify interfaces #12, #20, #21 are covered by frontend tasks
