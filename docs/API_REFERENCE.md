# Catálogo de Endpoints API — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `899bd44` (branch `feat/student-redesign`)
> **Fuente de verdad**: este archivo + `backend/app/routers/*.py` + `backend/app/schemas/*.py` + `backend/app/middleware/auth.py`
> **Cómo regenerar**: ver §"Regenerar este catálogo" al final.

Este documento es el catálogo verificable de cada endpoint REST expuesto por el backend FastAPI (Mabel-IA). Cubre las 12 áreas estudiante/sistema y las 7 áreas admin (Fases 1-8.1 implementadas).

---

## Convenciones globales

- **Prefix raíz**: todos los routers están registrados con prefijo `/api/v1/` desde `backend/app/main.py` (líneas 72-92).
- **Auth**: `Authorization: Bearer <JWT>` salvo donde se indique "pública".
  - `get_current_user` (middleware/auth.py:21): decodifica HS256, rechaza si usuario fue eliminado (`deleted_at`) o si fue deshabilitado vía admin panel (`disabled_at` → HTTP 403 "Cuenta deshabilitada").
  - `require_role(role)` (middleware/auth.py:60): exige `current_user.role == role`. Aliases: `require_admin = require_role("admin")`.
  - `require_consent` (middleware/auth.py:72): exige `consent_status == "ok"` para roles distintos a admin; admin pasa siempre.
- **Content-Type**: `application/json` por defecto. Excepciones: `multipart/form-data` para `POST /asr/transcribe`, `text/event-stream` (SSE) para `POST /sessions/{id}/messages`, `audio/wav` binario para `GET /tts/synthesize`, `text/csv` para los exports admin.
- **Errores estándar**: `{"detail": "string"}` con el status code apropiado.
- **JWT**: emitido por `AuthService.login` y `register`. Firmado con HS256 y `JWT_SECRET`. `sub = user.id` (UUID string).
- **CORS**: orígenes permitidos vía `settings.cors_origins_list` (env `CORS_ORIGINS`, default `http://localhost:5173`).
- **Privacidad (D-03)**: ningún endpoint admin retorna `messages.content`. Emails se enmascaran a `{first_char}***@{domain}` (D-04). Las exportaciones CSV anonimizan IDs vía `sha256(value)[:16]` (D-08).
- **Auditoría (D-12)**: cada mutación admin / acción sensible escribe una fila en `audit_logs` dentro de la MISMA transacción del cambio. **Patrón mixto** según el endpoint: (a) en endpoints de `admin/users_service.py`, `admin/reports_service.py`, `admin/safety_events_service.py`, `admin/empathy_service.py` — el SERVICIO emite `audit_log_action` y el router solo hace `db.commit()` al final. (b) en `admin/config_router.py` (`change_config`, `gemini_test`, `delete_consent_version_draft`) y en `data_control_router.py` (toggles + delete sessions) — el ROUTER emite tanto el audit como el commit. En ambos casos el resultado es atómico: el audit y la mutación se rollback juntas si algo falla. Para añadir una nueva acción auditada, seguir el patrón del archivo más cercano (no asumir uno único).

---

## Tabla de routers

| Router | Prefix relativo | Archivo | Endpoints |
|---|---|---|---|
| Health | (raíz `/api/v1`) | `app/main.py:95` | 1 |
| Auth | `/auth` | `routers/auth_router.py` | 6 |
| Consent | (sin prefix) | `routers/consent_router.py` | 4 |
| Users | `/users` | `routers/users_router.py` | 3 |
| Preferences | `/preferences` | `routers/preference_router.py` | 2 |
| Sessions / Messages | `/sessions` | `routers/session_router.py` | 9 |
| Reports | `/messages` | `routers/report_router.py` | 2 |
| Safety Events | `/safety-events` | `routers/safety_event_router.py` | 1 |
| System Config | `/system-config` | `routers/system_config_router.py` | 1 |
| ASR | `/asr` | `routers/asr_router.py` | 1 |
| TTS | `/tts` | `routers/tts_router.py` | 1 |
| Data Control | (sin prefix, mixto) | `routers/data_control_router.py` | 5 |
| LLM Health | `/llm` | `routers/llm_health_router.py` | 1 |
| Admin · Users | `/admin/users` | `routers/admin/users_router.py` | 9 |
| Admin · Reports | `/admin/reports` | `routers/admin/reports_router.py` | 3 |
| Admin · Safety Events | `/admin/safety-events` | `routers/admin/safety_events_router.py` | 3 |
| Admin · Metrics | `/admin/...` | `routers/admin/metrics_router.py` | 7 |
| Admin · Config | `/admin/...` | `routers/admin/config_router.py` | 8 |
| Admin · Audit Logs | `/admin/logs` | `routers/admin/audit_logs_router.py` | 2 |
| Admin · Empathy Ratings | `/admin/empathy-ratings` | `routers/admin/empathy_ratings_router.py` | 5 |

**Total**: **75 endpoints** (74 routers `@router.<verb>` + 1 health `@app.get` declarado directo sobre la app FastAPI en `main.py:95`).

---

## Endpoints por router

### Health (raíz)

#### GET /api/v1/health
- **Auth**: pública
- **Request**: sin parámetros
- **Response 200**: `{"status": "ok", "version": "0.1.0"}`
- **Implementación**: `app/main.py:95`
- **Notas**: usado por healthchecks externos (Railway).

---

### Auth (`/auth`)

#### POST /auth/register
- **Auth**: pública
- **Request body** (`RegisterRequest` — `schemas/auth.py:8`):
  ```json
  {"email": "string@umb.edu.co", "password": "string", "display_name": "string"}
  ```
  Validaciones: email obligatorio `@umb.edu.co`, password ≥8 chars con mayúscula + número + especial, display_name ≥2 chars.
- **Response 201** (`UserResponse`):
  ```json
  {"id": "uuid", "email": "string", "display_name": "string", "role": "student", "created_at": "iso8601"}
  ```
- **Errores**: 409 `"Este email ya esta registrado"` (DUPLICATE_EMAIL); 422 validación.
- **Audit log**: `action="user_register"` (lo emite `AuthService.register` en la misma transacción — D-12 atómico).
- **Implementación**: `auth_router.py:31` → `AuthService.register()`
- **Notas**: solo emails `@umb.edu.co`. El admin no se registra por aquí (seed vía `scripts/seed_admin.py`).

#### POST /auth/login
- **Auth**: pública
- **Request body** (`LoginRequest`):
  ```json
  {"email": "string", "password": "string", "remember_me": false}
  ```
- **Response 200** (`LoginResponse`):
  ```json
  {"access_token": "jwt", "token_type": "bearer", "user": {UserResponse}}
  ```
- **Errores**: 401 `"Credenciales invalidas"`; 403 `"Cuenta deshabilitada: <reason>"`.
- **Audit log**:
  - Éxito (admin): `action="login"`, `actor_role="admin"`, `details={role, remember_me}`.
  - Éxito (student): `action="user_login"`, `actor_role="student"`.
  - Falla credenciales: `action="user_login_failed"`, `actor_role="system"`, `actor_id=None`, `details={email}`.
- **Implementación**: `auth_router.py:55`
- **Notas**: nunca persistir password/hash en details (D-03). Brute-force se observa en `/admin/logs` filtrando por action.

#### POST /auth/forgot-password
- **Auth**: pública
- **Request body** (`ForgotPasswordRequest`): `{"email": "string"}`
- **Response 200** (`ForgotPasswordResponse`): `{"message": "string", "reset_link": "url | null"}`
- **Audit log** (solo si email existe): `action="password_reset_requested"`, `actor_role="student"`, `details={email}`.
- **Implementación**: `auth_router.py:121`
- **Notas**: anti-enumeration (D-03) — la respuesta es idéntica si el email existe o no. `reset_link` solo se incluye en dev (env `DEBUG=true`); en prod se enviaría por email.

#### GET /auth/reset-password/{token}
- **Auth**: pública
- **Path params**: `token` (string)
- **Response 200** (`TokenValidationResponse`): `{"valid": bool, "reason": "string | null"}`
- **Implementación**: `auth_router.py:150`

#### POST /auth/reset-password
- **Auth**: pública (el token actúa como autenticación de un solo uso)
- **Request body** (`ResetPasswordRequest`):
  ```json
  {"token": "string", "new_password": "string"}
  ```
  `new_password` debe cumplir reglas de fortaleza (igual que `RegisterRequest`).
- **Response 200**: `{"message": "Contrasena actualizada exitosamente"}`
- **Errores**: 400 `"Token invalido"` o `"Este enlace ha expirado. Solicita uno nuevo."`.
- **Audit log**: `action="password_reset_completed"`, `actor_role="student"`.
- **Implementación**: `auth_router.py:155`

#### PUT /auth/change-password
- **Auth**: JWT (cualquier rol)
- **Request body** (`ChangePasswordRequest`):
  ```json
  {"current_password": "string", "new_password": "string"}
  ```
- **Response 200**: `{"message": "Contrasena actualizada exitosamente"}`
- **Errores**: 401 `"Contrasena actual incorrecta"` (WRONG_PASSWORD); 400 `"La nueva contrasena debe ser diferente a la actual"` (SAME_PASSWORD); 422 validación.
- **Audit log**: ⚠️ **NO emite audit_log al 2026-05-24** (`AccountService.change_password` actualiza la contraseña sin trail). Gap de compliance Ley 1581/2012 art. 25 — DR pendiente Fase 10. La acción `⚠ no-audit (pendiente)` NO existe en `ALLOWED_ACTIONS`; añadirla + emitir es trabajo futuro.
- **Implementación**: `auth_router.py:188` → `AccountService.change_password()`

---

### Consent (sin prefix de router)

#### GET /consent-versions/active
- **Auth**: JWT
- **Response 200** (`ConsentVersionResponse`):
  ```json
  {"id": "uuid", "version": "v1.0", "title": "string", "body": "markdown", "status": "active", "published_at": "iso8601 | null", "created_at": "iso8601"}
  ```
- **Errores**: 404 `"No hay version de consentimiento activa"`.
- **Implementación**: `consent_router.py:29`

#### POST /consents
- **Auth**: JWT con role=`student` (admin no firma consent)
- **Request body** (`AcceptConsentRequest`):
  ```json
  {"consent_version_id": "uuid", "scope": "solo_uso | uso_mejora_anon"}
  ```
- **Response 201** (`ConsentResponse`):
  ```json
  {"id": "uuid", "user_id": "uuid", "scope": "string", "accepted_at": "iso8601", "revoked_at": "iso8601 | null", "consent_version_id": "uuid"}
  ```
- **Errores**: 404 `"Version de consentimiento no encontrada o no esta activa"` (INVALID_VERSION); 409 `"Ya existe un registro para esta version. Usa PATCH para re-aceptar."` (DUPLICATE_CONSENT).
- **Audit log**: `action="consent_granted"` (emitido por `ConsentService`, `consent_service.py:65`).
- **Implementación**: `consent_router.py:43`

#### PATCH /consents/current
- **Auth**: JWT con role=`student`
- **Request body** (`PatchConsentRequest`):
  ```json
  {"action": "re-accept | reduce-scope | revoke", "scope": "solo_uso | uso_mejora_anon | null"}
  ```
  `scope` es requerido para `re-accept` y `reduce-scope`.
- **Response 200** (`ConsentResponse`)
- **Errores**: 404 (`NO_ACTIVE_VERSION`, `NO_CONSENT_FOR_VERSION`); 409 (`ALREADY_ACTIVE`, `ALREADY_SOLO_USO`, `CONSENT_REVOKED`, `ALREADY_REVOKED`); 422 (`SCOPE_REQUIRED`, `UNSUPPORTED_ACTION`).
- **Notas**: UPDATE in-place sobre `consents` (no nuevos INSERT) gracias a `uq_consents_user_version`. Permite re-aceptación post-revocación.
- **Implementación**: `consent_router.py:76`

#### GET /users/me/consent-status
- **Auth**: JWT
- **Response 200** (`ConsentStatusResponse`):
  ```json
  {"status": "ok | no_consent | revoked | new_version_required", "current_version": "string | null", "new_version": "string | null", "scope": "string | null"}
  ```
- **Implementación**: `consent_router.py:135`
- **Notas**: la `ConsentGuard` del frontend usa este endpoint para decidir si redirige a `/consent`.

---

### Users (`/users`)

#### GET /users/me
- **Auth**: JWT
- **Response 200** (`UserResponse`): ver `POST /auth/register`.
- **Implementación**: `users_router.py:20`

#### DELETE /users/me
- **Auth**: JWT con role=`student`
- **Request body** (`DeleteAccountRequest`):
  ```json
  {"confirmation": "ELIMINAR"}
  ```
  Pydantic valida que `confirmation == "ELIMINAR"`.
- **Response 200**: `{"message": "Cuenta eliminada exitosamente"}`
- **Errores**: 400 `"Debes escribir ELIMINAR para confirmar"` (INVALID_CONFIRMATION); 422 validación Pydantic.
- **Audit log**: `action="user_delete"`, `actor_role="student"` (emitido por `AccountService.delete_account`, `account_service.py:50`). El audit se emite ANTES del DELETE; tras el CASCADE, `actor_id` queda NULL por FK SET NULL, y `details.email` preserva el identificador anónimo.
- **Notas**: Hard DELETE con CASCADE sobre sessions/messages/preferences/consents. `safety_events.user_id` → SET NULL (Evo 005b — preserva eventos anónimos). Decisión D-14: Hard DELETE directo en MVP.
- **Implementación**: `users_router.py:25`

#### GET /users/me/export
- **Auth**: JWT con role=`student`
- **Query**: `format=json|csv` (default `json`)
- **Response 200**:
  - JSON: shape exportado por `AccountService.export_data` (todas las tablas del usuario).
  - CSV: `Content-Type: text/csv`, `Content-Disposition: attachment; filename=mabel-datos.csv`.
- **Audit log**: ⚠️ **NO emite audit_log al 2026-05-24** (`users_router.py:46` pass-through a `AccountService.export_data` sin trail). Gap de compliance Ley 1581/2012 art. 25 — DR pendiente Fase 10. El string canónico `"export_data"` SÍ existe en `ALLOWED_ACTIONS` (usado por exports admin); pendiente añadir la emisión también al export self-service.
- **Implementación**: `users_router.py:46`

---

### Preferences (`/preferences`)

#### GET /preferences/me
- **Auth**: JWT con role=`student`
- **Response 200** (`PreferencesResponse`):
  ```json
  {"user_id": "uuid", "save_history": true, "ui_language": "es", "tts_voice": "string | null", "accessibility": {...} | null, "checkin_enabled": true, "preferred_chat_mode": "chat | avatar"}
  ```
- **Errores**: 404 `"Preferencias no encontradas"`.
- **Implementación**: `preference_router.py:18`

#### PUT /preferences
- **Auth**: JWT con role=`student`
- **Request body** (`UpdatePreferencesRequest`): todos los campos opcionales (upsert parcial).
  ```json
  {"save_history": bool, "ui_language": "es", "tts_voice": "string", "accessibility": {...}, "checkin_enabled": bool, "preferred_chat_mode": "chat | avatar"}
  ```
- **Response 200** (`PreferencesResponse`)
- **Notas**: idempotente. El toggle `save_history` también afecta retención (lo orquestaba `data_control` para acciones de retroactivo).
- **Implementación**: `preference_router.py:32`

---

### Sessions & Messages (`/sessions`)

#### POST /sessions
- **Auth**: JWT + consent OK
- **Request body** (opcional) (`CreateSessionRequest`):
  ```json
  {"topic_hint": "string | null", "checkin_payload": {CheckinPayload} | null}
  ```
  `CheckinPayload` (todos opcionales): `mood` (0-10), `energy` (1-4), `stress` (1-4), `sleep_quality` (`mal|regular|bien|muy_bien`), `sleep` (0-24), `loneliness` (1-4), `focus` (lista de `Academico|Social|Familiar|Pareja|Salud|Economico|Futuro|Otro`), `focus_other` (≤80), `note` (≤500).
- **Response 201** (`CreateSessionResponse`):
  ```json
  {"id": "uuid", "started_at": "iso8601", "ended_at": null, "topic_hint": "string | null", "checkin_opt_in": bool, "checkin_completed_at": "iso8601 | null", "avatar_used": bool, "previous_session_closed": bool}
  ```
- **Implementación**: `session_router.py:46`
- **Notas — lazy session create**: si `checkin_payload` viene en el body, la sesión nace con check-in completado en la MISMA transacción (no hay ventana huérfana). Pattern introducido 2026-05-23. Si existía una sesión previa abierta del usuario, el servicio la cierra y reporta `previous_session_closed=true`.

#### GET /sessions
- **Auth**: JWT + consent OK
- **Response 200**: `list[SessionResponse]`
- **Notas**: filtra sesiones `hidden_at IS NULL` y pertenecientes al usuario actual.
- **Implementación**: `session_router.py:79`

#### GET /sessions/{session_id}
- **Auth**: JWT + consent OK
- **Path params**: `session_id` (UUID)
- **Response 200** (`SessionDetailResponse`): `SessionResponse` + `checkin_payload: dict | null`, `meta: dict | null`.
- **Errores**: 404 `"Sesion no encontrada"` (NOT_FOUND); 403 `"Acceso denegado"`.
- **Implementación**: `session_router.py:87`

#### PATCH /sessions/{session_id}
- **Auth**: JWT + consent OK
- **Request body** (union): `UpdateSessionCheckin` o `UpdateSessionEnd`.
  - `{"checkin_payload": {CheckinPayload}}` — completa el check-in.
  - `{"action": "end"}` — finaliza la sesión (idempotente: 409 si ya terminó).
- **Response 200** (`SessionDetailResponse`)
- **Errores**: 404 (NOT_FOUND); 403 (ACCESS_DENIED); 409 `"Sesion finalizada"` o `"Check-in ya completado"`.
- **Implementación**: `session_router.py:102`

#### POST /sessions/{session_id}/greeting
- **Auth**: JWT + consent OK
- **Query**: `voice_mode=bool` (default `false`)
- **Response 200**: `{"greeting": "string | null"}`. `null` si la sesión ya terminó o no procede.
- **Errores**: 404, 403.
- **Notas**: genera + persiste el saludo asistente al iniciar la conversación. Lazy — solo se llama una vez por sesión.
- **Implementación**: `session_router.py:130`

#### POST /sessions/{session_id}/messages (SSE)
- **Auth**: JWT + consent OK
- **Request body** (`SendMessageRequest`):
  ```json
  {"content": "string (1-2000)", "voice_mode": false}
  ```
- **Response 200**: `text/event-stream`. Cada evento tiene la forma `data: <json>\n\n` donde `<json>` es uno de:
  - `{"risk_detected": true, "severity": <int>}` — pre-filter guardrail flag (puede aparecer antes del primer token).
  - `{"token": "<string>"}` — fragmento de respuesta del LLM (uno por chunk del stream).
  - `{"error": "<string>"}` — error legible al usuario; el stream termina.
  - `{"done": true, "message_id": "<uuid | null>", "latency_ms": <int>, "risk_detected": true (opcional)}` — evento final.
- **Errores HTTP** (antes de iniciar el stream): 404, 403, 409 `"Sesion finalizada"`.
- **Audit log**: ninguno directo; los `safety_events` con `event_type="risk_detected"` los crea `GuardrailsService`.
- **Notas**:
  - Sin reconnect formal; si el cliente se desconecta a mitad del stream, la mutación del DB (`messages.create` para user + assistant) ya quedó comiteada si `save_history=true`.
  - `voice_mode=true` activa system-prompt extra para respuestas TTS-friendly (sin markdown ni emojis), excepto cuando el modelo activo es `mabel-gemma4` (ya entrenado así).
- **Implementación**: `session_router.py:154` → `ChatService.send_message()` (chat_service.py:248)

#### GET /sessions/{session_id}/messages
- **Auth**: JWT + consent OK
- **Response 200**: `list[MessageResponse]`
  ```json
  [{"id": "uuid", "role": "user|assistant", "content": "string", "created_at": "iso8601", "safety_flags": {...} | null}]
  ```
- **Errores**: 404, 403.
- **Implementación**: `session_router.py:185`

#### GET /sessions/{session_id}/rating
- **Auth**: JWT + consent OK
- **Response 200**: `SessionRatingResponse` o `null` si nunca calificó.
  ```json
  {"rating": 1-5, "created_at": "iso8601", "updated_at": "iso8601"}
  ```
- **Errores**: 404, 403.
- **Implementación**: `session_router.py:203`

#### PUT /sessions/{session_id}/rating
- **Auth**: JWT + consent OK
- **Request body** (`SessionRatingUpsertRequest`): `{"rating": 1-5}`
- **Response 200** (`SessionRatingResponse`)
- **Errores**: 404, 403.
- **Audit log**: `action="session_rated"`, `details={rating, previous_rating}` SOLO cuando el valor cambia (no se loguea re-PUT del mismo valor).
- **Notas**: idempotente vía UNIQUE(session_id, user_id). Funciona en sesiones activas y finalizadas.
- **Implementación**: `session_router.py:240`

---

### Reports (`/messages`)

#### POST /messages/{message_id}/reports
- **Auth**: JWT + consent OK
- **Path params**: `message_id` (UUID)
- **Request body** (`CreateReportRequest`):
  ```json
  {"reason": "hallucination | harmful | privacy | low_empathy | other", "severity": 1-5 | null, "details": "string (≤1000) | null"}
  ```
- **Response 201** (`ReportResponse`):
  ```json
  {"id": "uuid", "message_id": "uuid", "reason": "string", "severity": int | null, "details": "string | null", "status": "open", "created_at": "iso8601"}
  ```
- **Errores**: 404 `"Mensaje no encontrado"`; 403 `"Acceso denegado"`; 400 `"Solo puedes reportar mensajes del asistente"` (CANNOT_REPORT); 409 `"Ya reportaste este mensaje"` (DUPLICATE).
- **Side effect**: si `severity >= sos_severity_threshold` el `ReportService` crea un `safety_event` paralelo con `event_type="user_report"`.
- **Implementación**: `report_router.py:27`

#### GET /messages/{message_id}/reports/check
- **Auth**: JWT + consent OK
- **Response 200** (`ReportCheckResponse`): `{"already_reported": bool}`
- **Implementación**: `report_router.py:56`

---

### Safety Events (`/safety-events`)

#### POST /safety-events
- **Auth**: JWT + consent OK
- **Request body** (`CreateSafetyEventRequest`):
  ```json
  {"event_type": "risk_detected | redirect_shown | user_report", "payload": {...}, "session_id": "uuid | null"}
  ```
- **Response 201** (`SafetyEventResponse`):
  ```json
  {"id": "uuid", "event_type": "string", "payload": {...} | null, "status": "active", "created_at": "iso8601"}
  ```
- **Notas**: usado por el frontend para registrar `redirect_shown` cuando el SOS overlay aparece. `risk_detected` lo crea el backend a partir del pipeline de guardrails.
- **Implementación**: `safety_event_router.py:12`

---

### System Config (`/system-config`)

#### GET /system-config/sos
- **Auth**: JWT (cualquier rol)
- **Response 200** (`SosConfigResponse`):
  ```json
  {"hotline_numbers": [{"label": "string", "number": "string"}, ...], "guardrails_enabled": bool}
  ```
- **Notas**: alimenta la SOS sheet del frontend. `hotline_numbers` y `guardrails_enabled` viven en `system_config` (TEXT PK).
- **Implementación**: `system_config_router.py:11`

---

### ASR (`/asr`)

#### POST /asr/transcribe
- **Auth**: JWT + consent OK
- **Content-Type**: `multipart/form-data`
- **Form fields**:
  - `audio` (file, requerido) — formato webm/wav/etc. Se guarda en `settings.UPLOAD_DIR`.
  - `session_id` (query/form, UUID opcional) — si presente, el texto se persiste como `message` (rol `user`) en la sesión.
- **Response 200**: `{"text": "string", "message_id": "uuid | null"}`
- **Errores**:
  - 400 `"No se detecto texto en el audio (N bytes capturados). Habla mas claro..."` cuando Whisper devuelve vacío.
  - 403 `"Acceso denegado"` si `session_id` no pertenece al usuario.
  - 409 `"Sesion finalizada"`.
  - 500 `"Error al transcribir audio: <ExceptionType>: <msg>"`.
- **Notas — privacidad audio (Ley 1581 / D-14)**:
  - Si `save_history=false` (`solo_uso`), el archivo se elimina siempre (incluso en empty-text para forensics).
  - Si `save_history=true` y hay `session_id`, se crea un `attachments` con `kind="audio"` y `path` al archivo persistido.
  - Sin `session_id` se elimina el archivo siempre.
- **Implementación**: `asr_router.py:23` → `AsrService.transcribe()` (faster-whisper).

---

### TTS (`/tts`)

#### GET /tts/synthesize
- **Auth**: JWT + consent OK
- **Query**:
  - `text` (string, 1-5000, requerido)
  - `voice` (string, opcional) — override del `PIPER_VOICE` default.
- **Response 200**: `audio/wav` binario (`Content-Disposition: inline; filename=tts.wav`).
- **Errores**:
  - 503 `"TTS no disponible: <FileNotFoundError msg>"` (binario Piper o modelo faltante).
  - 504 `"TTS tardo demasiado en responder."`
  - 500 `"Error al sintetizar audio: <msg>"`.
- **Notas**: Piper TTS via subprocess. El servicio impone timeout interno y lo convierte a `ValueError` para evitar 500s sin headers CORS (los 500 no manejados saltan ANTES del middleware CORS y rompen el browser).
- **Implementación**: `tts_router.py:14` → `TtsService.synthesize()`.

---

### Data Control (mixto — sin prefix de router)

> Implementa los flows del paquete "Control de datos" (auditoría ético 2026-05-23). Detalle: `docs/DATA_RETENTION_POLICY.md`. Todos exigen role=`student`. Todos siguen D-12 (servicio flush, router emite el único commit junto al audit_log).

#### POST /users/me/history/toggle-off
- **Auth**: JWT con role=`student`
- **Request body**: vacío
- **Response 200**:
  ```json
  {"behavior": "hard_delete | soft_hide", "affected_sessions": int, "deleted_messages": int}
  ```
- **Comportamiento**:
  - Scope `solo_uso` o sin consent → hard DELETE de sessions + messages (no hay base legal para retener).
  - Scope `uso_mejora_anon` / `uso_investigacion` → soft hide masivo (`hidden_at`); data persiste para investigación.
  - En ambos casos `preferences.save_history := false` en la misma transacción.
- **Audit log**: `action="history_toggle_off"`, `details={behavior, scope, affected_sessions, deleted_messages}`.
- **Implementación**: `data_control_router.py:49`

#### POST /users/me/history/toggle-on
- **Auth**: JWT con role=`student`
- **Request body**: vacío
- **Response 200**: `{"ok": true}`
- **Notas**: NO des-oculta retroactivamente las sesiones previamente marcadas (one-way intencional). Sólo afecta sesiones futuras.
- **Audit log**: `action="history_toggle_on"`, `details={}`.
- **Implementación**: `data_control_router.py:102`

#### PATCH /sessions/{session_id}/hide
- **Auth**: JWT con role=`student`
- **Response 200**: `{"ok": true, "changed": bool}` (idempotente).
- **Errores**: 404 `"Sesion no encontrada"`; 403 `"Acceso denegado"`.
- **Audit log**: `action="session_hidden"`, `details={reason: "user_per_session"}` SOLO cuando el estado realmente cambia (evita ruido por doble-click).
- **Implementación**: `data_control_router.py:138`

#### DELETE /sessions/{session_id}
- **Auth**: JWT con role=`student`
- **Response 204**: sin body.
- **Errores**: 404, 403.
- **Audit log**: `action="session_deleted_hard"`, `details={messages_deleted}`.
- **Notas**: Hard DELETE de sesión + CASCADE de sus messages (ejercicio individual del derecho de supresión — Ley 1581 art. 8 lit. e).
- **Implementación**: `data_control_router.py:178`

#### DELETE /users/me/messages
- **Auth**: JWT con role=`student`
- **Response 200**: `{"affected_sessions": int, "deleted_messages": int, ...}`
- **Notas**: Hard DELETE de TODAS las sesiones + messages. Preserva cuenta, preferencias y consents (el usuario puede seguir usando Mabel con historial vacío).
- **Audit log**: `action="user_messages_hard_delete"`, `details={sessions_deleted, messages_deleted}`.
- **Implementación**: `data_control_router.py:219`

---

### LLM Health (`/llm`)

#### GET /llm/health
- **Auth**: JWT (cualquier rol)
- **Response 200**: uno de:
  - `{"status": "warm", "elapsed_ms": int}` — `/v1/models` upstream respondió 200.
  - `{"status": "cold", "elapsed_ms": int}` — upstream 503 (Modal calentando worker).
  - `{"status": "down", "elapsed_ms": int, "http_status": int}` — otro código.
  - `{"status": "down", "reason": "timeout"}` o `{"status": "down", "reason": "<ExceptionType>", "detail": "<str:200>"}`.
- **Notas**: no consume tokens. Diseñado para pre-warming desde el frontend al montar Chat/Voice. Timeout 15s (no bajar de 12s — el cold start de Modal responde 503 dentro de 2-5s pero proxies pueden tardar).
- **Implementación**: `llm_health_router.py:30`

---

## Endpoints Admin (`require_admin`)

> Todas requieren `JWT` con `role=admin`. RBAC implementado vía `require_admin = require_role("admin")` (middleware/auth.py:69). El frontend tiene además `RoleGuard` que redirige a `/` si no admin.

### Admin · Users (`/admin/users`)

#### GET /admin/users
- **Query**: `q` (búsqueda email/nombre), `status` (`active|disabled`), `consent_status` (`ok|no_consent|revoked|new_version_required`), `created_from`, `created_to` (dates), `cohort`, `page` (≥1, default 1), `page_size` (1-100, default 20).
- **Response 200** (`PaginatedResponse[UserAdminListItem]`):
  ```json
  {"items": [{"id": "uuid", "email_masked": "j***@umb.edu.co", "display_name": "string", "role": "student", "created_at": "iso", "last_session_at": "iso | null", "consent_status": "ok", "total_sessions": int, "disabled_at": "iso | null", "cohort": "string | null"}], "total": int, "page": int, "page_size": int}
  ```
- **Implementación**: `admin/users_router.py:49`

#### GET /admin/users/cohorts
- **Response 200**: `list[str]` (cohorts distintos no-nulos, ordenados).
- **Notas**: declarado ANTES de `/{user_id}` para que FastAPI no parsee "cohorts" como UUID.
- **Implementación**: `admin/users_router.py:82`

#### POST /admin/users/bulk-action
- **Request body** (`BulkUserActionRequest`):
  ```json
  {"user_ids": ["uuid", ...] (1-500), "action": "disable | enable | delete", "reason": "string (10-500) | null"}
  ```
  `reason` requerido si `action="disable"` (validador Pydantic `_require_reason_for_disable`).
- **Response 200** (`BulkUserActionResponse`):
  ```json
  {"action": "string", "applied": int, "skipped_admin": ["uuid"], "skipped_already_state": ["uuid"], "skipped_must_disable_first": ["uuid"], "not_found": ["uuid"]}
  ```
- **Audit log**: una fila por usuario afectado (la emite `AdminUsersService.bulk_action`).
- **Notas**: invariantes (admin protection, must-disable-before-delete) se aplican en el servicio y se reportan en los `skipped_*` lists.
- **Implementación**: `admin/users_router.py:104`

#### GET /admin/users/{user_id}
- **Response 200** (`UserAdminDetail`): identidad enmascarada + consent (`consent_status`, `consent_version`, `consent_scope`, `consent_granted_at`, `consent_revoked_at`) + preferences flags + statistics (`total_sessions`, `total_messages`, `last_session_at`, `total_reports_filed`, `total_safety_events`).
- **Errores**: 404 `"Usuario no encontrado"`.
- **Audit log**: `action="view_user"` (emitido por el servicio).
- **Implementación**: `admin/users_router.py:131`

#### DELETE /admin/users/{user_id}
- **Response 200**: `{"status": "deleted", "user_id": "uuid"}`
- **Errores**: 404 (USER_NOT_FOUND); 403 `"No se puede eliminar a un administrador"` (CANNOT_DELETE_ADMIN); 409 `"El usuario debe estar deshabilitado antes de eliminarlo"` (USER_NOT_DISABLED).
- **Audit log**: `action="delete_user"`.
- **Notas**: gated en `disabled_at IS NOT NULL` — la UI fuerza el flow "Deshabilitar → Eliminar".
- **Implementación**: `admin/users_router.py:151`

#### PATCH /admin/users/{user_id}/disable
- **Request body** (`DisableUserRequest`): `{"reason": "string (min 10 chars)"}`
- **Response 200**: `{"status": "disabled", "user_id": "uuid"}`
- **Errores**: 404; 403 (CANNOT_DISABLE_ADMIN); 409 `"El usuario ya esta deshabilitado"` (ALREADY_DISABLED).
- **Audit log**: `action="disable_user"`, `details={reason}`.
- **Implementación**: `admin/users_router.py:192`

#### PATCH /admin/users/{user_id}/enable
- **Request body**: vacío
- **Response 200**: `{"status": "enabled", "user_id": "uuid"}`
- **Errores**: 404; 409 (ALREADY_ENABLED).
- **Audit log**: `action="enable_user"`.
- **Implementación**: `admin/users_router.py:229`

#### PATCH /admin/users/cohort/bulk
- **Request body** (`BulkCohortRequest`):
  ```json
  {"user_ids": ["uuid", ...] (1-500), "cohort": "string (≤64) | null"}
  ```
- **Response 200** (`BulkCohortResponse`):
  ```json
  {"updated": int, "unchanged": int, "not_found": ["uuid"], "skipped_admin": ["uuid"]}
  ```
- **Notas**: declarado antes de `/{user_id}/cohort` para resolver path literalmente.
- **Audit log**: `action="update_cohort (bulk)"`.
- **Implementación**: `admin/users_router.py:260`

#### PATCH /admin/users/{user_id}/cohort
- **Request body** (`SetCohortRequest`): `{"cohort": "string (≤64) | null"}` (null limpia el cohort).
- **Response 200**: `{"id": "uuid", "cohort": "string | null"}`
- **Errores**: 404.
- **Audit log**: `action="update_cohort"`, `details={cohort_old, cohort_new}`.
- **Implementación**: `admin/users_router.py:283`

---

### Admin · Reports (`/admin/reports`)

#### GET /admin/reports
- **Query**: `reason` (enum), `severity` (1-5), `status` (`open|triaged|resolved|dismissed`), `from`, `to` (dates), `page`, `page_size`.
- **Response 200** (`PaginatedResponse[ReportAdminItem]`):
  ```json
  {"items": [{"id": "uuid", "message_id": "uuid", "reporter_id": "uuid", "reporter_id_truncated": "string", "reason": "string", "severity": int | null, "status": "string", "created_at": "iso", "triaged_at": "iso | null", "reporter_context": "string | null", "notes_history": [{"at": "iso | null", "status": "string | null", "notes": "string | null"}, ...]}], "total": int, "page": int, "page_size": int}
  ```
- **Notas**: NUNCA incluye `messages.content` (D-03). `notes_history` se parsea desde `message_reports.details` (formato `[ISO] <status>: <notes>` separados por newline).
- **Implementación**: `admin/reports_router.py:38`

#### GET /admin/reports/export.csv
- **Query**: mismos filtros que `GET /admin/reports`.
- **Response 200**: `text/csv` streaming (`Content-Disposition: attachment; filename="reports.csv"`).
- **Audit log**: `action="export_data"`, `details={resource: "reports", filters: {...}}` emitido por el servicio antes del stream.
- **Implementación**: `admin/reports_router.py:68`

#### PATCH /admin/reports/{report_id}
- **Request body** (`ReportStatusUpdate`):
  ```json
  {"status": "triaged | resolved | dismissed", "notes": "string | null"}
  ```
- **Response 200** (`ReportAdminItem`)
- **Errores**: 404 `"Reporte no encontrado"`; 409 `"Transicion de estado invalida"` (INVALID_TRANSITION — `open → triaged → resolved` o `open → dismissed`).
- **Audit log**: `action="review_report"`, `details={old_status, new_status, notes_appended}`.
- **Implementación**: `admin/reports_router.py:102`

---

### Admin · Safety Events (`/admin/safety-events`)

#### GET /admin/safety-events
- **Query**: `event_type` (str), `severity` (1-5), `status` (`active|reviewed|resolved`), `from`, `to`, `page`, `page_size`.
- **Response 200** (`PaginatedResponse[SafetyEventAdminItem]`):
  ```json
  {"items": [{"id": "uuid", "event_type": "string", "session_id_truncated": "string | null", "severity": int | null, "status": "string", "created_at": "iso", "payload": {...} | null}], "total": int, "page": int, "page_size": int}
  ```
- **Notas**: NUNCA contenido del mensaje (D-03); `session_id` truncado. `user_id` puede ser null para eventos post-eliminación de cuenta (SET NULL, Evo 005b).
- **Implementación**: `admin/safety_events_router.py:42`

#### GET /admin/safety-events/export.csv
- **Query**: mismos filtros.
- **Response 200**: `text/csv` streaming.
- **Audit log**: `action="export_data"`, `details={resource: "safety_events", filters: {...}}`.
- **Implementación**: `admin/safety_events_router.py:72`

#### PATCH /admin/safety-events/{event_id}
- **Request body** (`SafetyEventStatusUpdate`):
  ```json
  {"status": "reviewed | resolved", "notes": "string | null"}
  ```
- **Response 200** (`SafetyEventAdminItem`)
- **Errores**: 404 `"Evento de seguridad no encontrado"`; 409 `"Transicion de estado invalida"`.
- **Audit log**: `action="review_safety_event"`.
- **Implementación**: `admin/safety_events_router.py:106`

---

### Admin · Metrics (`/admin/...`)

> Todos los endpoints aceptan `cohort` (str) como filtro opcional. Los que tienen rango aceptan `from`/`to` (date ISO).

#### GET /admin/dashboard
- **Query**: `cohort` opcional.
- **Response 200**: `dict[str, Any]` — KPIs globales del dashboard #27.
- **Implementación**: `admin/metrics_router.py:43`

#### GET /admin/metrics/usage
- **Query**: `from`, `to`, `cohort`.
- **Response 200**: `dict` — series de uso (sesiones, mensajes, MAU, etc.).
- **Implementación**: `admin/metrics_router.py:53`

#### GET /admin/metrics/wellbeing
- **Query**: `from`, `to`, `cohort`.
- **Response 200**: `dict` — agregados de mood/stress/energy/loneliness/sleep del check-in.
- **Implementación**: `admin/metrics_router.py:65`

#### GET /admin/metrics/technical
- **Query**: `from`, `to`, `cohort`.
- **Response 200**: `dict` — latencias (p50/p95), errores, breakdown LLM/ASR/TTS.
- **Implementación**: `admin/metrics_router.py:77`

#### GET /admin/metrics/safety
- **Query**: `from`, `to`, `cohort`.
- **Response 200**: `dict` — agregados de safety_events + reports.
- **Implementación**: `admin/metrics_router.py:89`

#### GET /admin/metrics/study
- **Query**: `cohort`.
- **Response 200**: `dict` — métricas del estudio (Fase 8.1, tab E).
- **Implementación**: `admin/metrics_router.py:101`

#### GET /admin/metrics/export.csv
- **Query**: `tab` (`usage|wellbeing|technical|safety|study`, requerido), `from`, `to`, `cohort`.
- **Response 200**: `text/csv` streaming (`filename="metrics_<tab>.csv"`).
- **Audit log**: `action="export_data"`, `target_type="metrics"`, `details={tab, from, to, cohort}`. Se emite ANTES del stream para no perderse si el cliente desconecta.
- **Implementación**: `admin/metrics_router.py:111`

---

### Admin · Config (`/admin/...`)

#### GET /admin/config
- **Response 200**: `list[SystemConfigItem]`
  ```json
  [{"key": "string", "value": <any JSON>, "updated_at": "iso"}, ...]
  ```
- **Implementación**: `admin/config_router.py:52`

#### PATCH /admin/config/{key}
- **Headers especiales**: `X-Study-Lock-Override: true` para bypass del study lock.
- **Request body** (`ConfigUpdateRequest`): `{"value": <any JSON>}`
- **Response 200** (`SystemConfigItem`)
- **Errores**:
  - 404 `"Clave de configuracion no encontrada"`.
  - 422 `"<msg>"` cuando `INVALID_VALUE:<msg>` (validación per-key).
  - 423 `"STUDY_LOCK_ENABLED:<key>"` si `study_lock_enabled=true` y `key ∈ {safety_keywords, sos_severity_threshold, guardrails_enabled}` (D-04 Fase 8.1) y no se envió el header de override.
- **Audit log**: `action="change_config"`, `target_type="system_config"`, `details={key, old_value, new_value, override?: true}`.
- **Implementación**: `admin/config_router.py:64`

#### GET /admin/consent-versions
- **Response 200**: `list[ConsentVersionItem]` (incluye draft + active + archived).
- **Implementación**: `admin/config_router.py:140`

#### POST /admin/consent-versions
- **Request body** (`ConsentVersionCreate`):
  ```json
  {"version": "string", "title": "string", "body": "markdown (min 10)"}
  ```
- **Response 201** (`ConsentVersionItem`) — `status="draft"` al crear.
- **Audit log**: `action="change_config"`, `target_type="consent_version"`, `details={operation: "create", version, title, status: "draft"}`.
- **Implementación**: `admin/config_router.py:155`

#### POST /admin/consent-versions/{version_id}/publish
- **Response 200** (`ConsentVersionItem`) con `status="active"` y `published_at` seteado.
- **Errores**: 404 `"Version de consentimiento no encontrada"` (VERSION_NOT_FOUND); 409 `"La version ya esta activa"` (ALREADY_ACTIVE).
- **Notas**: publicar archiva la versión activa anterior.
- **Audit log**: `action="change_config"`, `details={operation: "publish", version, new_status: "active"}`.
- **Implementación**: `admin/config_router.py:189`

#### DELETE /admin/consent-versions/{version_id}
- **Response 204**: sin body.
- **Errores**:
  - 404 (VERSION_NOT_FOUND).
  - 409 `"Solo se pueden eliminar borradores..."` (NOT_DRAFT).
  - 409 `"No se puede eliminar este borrador porque otro admin lo publicó..."` (HAS_REFERENCES — race condition).
- **Audit log**: `action="change_config"`, `details={operation: "delete_draft", version, title}` emitido ANTES del commit para preservar `target_id`.
- **Implementación**: `admin/config_router.py:235`

#### GET /admin/services-health
- **Response 200** (`ServicesHealthResponse`):
  ```json
  {"checked_at": "iso", "services": [{"label": "string", "status": "ok | fail | warn | na", "value": "string", "detail": "string | null"}, ...]}
  ```
- **Notas**: probe real de DB, LLM (vía cached `llm_last_test`), Piper binary + sidecar `.onnx.json`, faster-whisper, uptime. No audit log (lectura pura).
- **Implementación**: `admin/config_router.py:303`

#### GET /admin/llm-info
- **Response 200** (`LLMInfoResponse`):
  ```json
  {"provider": "string", "base_url": "string", "model": "string", "api_key_masked": "●●●●●●a8f7", "api_key_configured": bool, "timeout_ms": int, "last_test": {LLMLastTestInfo} | null}
  ```
- **Notas**: la API key NUNCA se retorna raw — solo masked. Cambiar provider/model/base_url requiere editar `.env` y restart.
- **Implementación**: `admin/config_router.py:319`

#### POST /admin/config/gemini/test
- **Request body**: vacío.
- **Response 200** (`GeminiTestResponse`):
  ```json
  {"ok": bool, "latency_ms": int, "model": "string", "error": "string | null", "last_test": {LLMLastTestInfo} | null}
  ```
- **Audit log**: `action="change_config"`, `target_type="gemini_test"`, `details={ok, latency_ms, model, error}`. NUNCA loguea prompt/response (D-03).
- **Notas — D-12 compliance**: el servicio (`gemini_ping`) flushea el UPSERT en `llm_last_test` dentro de un SAVEPOINT pero NO commitea; el router emite el ÚNICO commit que persiste UPSERT + audit_log atómicamente. Fix de F1 (2026-05-23).
- **Implementación**: `admin/config_router.py:339`

---

### Admin · Audit Logs (`/admin/logs`)

> Append-only por diseño (no hay PATCH ni DELETE). Emails de actors enmascarados (D-04). CSV anonimiza IDs (D-08).

#### GET /admin/logs
- **Query**: `actor_id` (UUID), `actor_role` (`admin|student|system`), `action` (str), `from`, `to` (dates), `page`, `page_size`.
- **Response 200** (`PaginatedResponse[AuditLogItem]`):
  ```json
  {"items": [{"id": "uuid", "actor_id": "uuid | null", "actor_role": "admin|student|system", "actor_email_masked": "j***@umb.edu.co | null", "action": "string", "target_type": "string | null", "target_id": "string | null", "details": {...} | null, "ip": "string | null", "created_at": "iso"}], "total": int, "page": int, "page_size": int}
  ```
- **Notas**: emails se resuelven en batch (single SELECT) para evitar N+1.
- **Implementación**: `admin/audit_logs_router.py:87`

#### GET /admin/logs/export.csv
- **Query**: mismos filtros.
- **Response 200**: `text/csv` streaming (`filename="audit_logs.csv"`). Columnas: `id, actor_id_hash, actor_role, action, target_type, target_id_hash, created_at, ip`. IDs hash = `sha256(value)[:16]`.
- **Audit log**: `action="export_data"`, `target_type="audit_logs"`, `details={resource: "logs", filters: {...}}` emitido ANTES del stream.
- **Implementación**: `admin/audit_logs_router.py:134`

---

### Admin · Empathy Ratings (`/admin/empathy-ratings`)

> Fase 8.1 Capability 3 (research-analytics-backend). Inter-rater scoring de respuestas del asistente.

#### GET /admin/empathy-ratings/queue
- **Query**: `limit` (1-100, default 20), `cohort` (str opcional).
- **Response 200** (`EmpathyQueueResponse`):
  ```json
  {"items": [{"message_id": "uuid", "session_id": "uuid", "content": "string", "created_at": "iso", "session_started_at": "iso | null", "preceding_user_message": "string | null"}], "total_pending": int}
  ```
- **Notas**: muestra mensajes assistant que ESTE rater aún no calificó (samplig D-07). `total_pending` permite el "mostrando N de M" honesto.
- **Implementación**: `admin/empathy_ratings_router.py:44`

#### POST /admin/empathy-ratings
- **Request body** (`EmpathyRatingCreate`):
  ```json
  {"message_id": "uuid", "score": 1-5, "criteria": {...} | null}
  ```
- **Response 201** (`EmpathyRatingItem`):
  ```json
  {"id": "uuid", "message_id": "uuid", "rater_id": "uuid | null", "score": int, "criteria": {...} | null, "created_at": "iso", "updated_at": "iso | null"}
  ```
- **Errores**: 409 `"Ya calificaste este mensaje"` (ALREADY_RATED); 422 `"Score fuera de rango (1-5)"` (INVALID_SCORE).
- **Audit log**: `action="empathy_rate"`, `details={message_id, score, criteria}`.
- **Implementación**: `admin/empathy_ratings_router.py:67`

#### GET /admin/empathy-ratings/rated
- **Query**: `cohort` opcional.
- **Response 200** (`EmpathyRatedResponse`):
  ```json
  {"items": [{"rating_id": "uuid", "score": int, "criteria": {...} | null, "created_at": "iso", "updated_at": "iso | null", "rater_id": "uuid | null", "rater_email_masked": "string | null", "is_mine": bool, "message_id": "uuid", "session_id": "uuid", "content": "string", "message_created_at": "iso", "session_started_at": "iso | null", "preceding_user_message": "string | null"}], "total": int}
  ```
- **Notas**: cross-rater (incluye ratings de otros admins). El frontend usa `is_mine` para greyear edits ajenos.
- **Implementación**: `admin/empathy_ratings_router.py:104`

#### PATCH /admin/empathy-ratings/{rating_id}
- **Request body** (`EmpathyRatingUpdate`):
  ```json
  {"score": 1-5 | null, "criteria": {...} | null}
  ```
- **Response 200** (`EmpathyRatingItem`)
- **Errores**: 404 `"Calificación no encontrada"`; 403 `"Solo el autor de la calificación puede editarla"` (FORBIDDEN); 422 (INVALID_SCORE).
- **Audit log**: `action="empathy_rate_updated"`, `details` con diff de valores previos.
- **Implementación**: `admin/empathy_ratings_router.py:125`

#### GET /admin/empathy-ratings/stats
- **Query**: `cohort` opcional.
- **Response 200**: `dict[str, Any]` — agregados para Tab E (mean score, distribución, inter-rater reliability, etc.).
- **Implementación**: `admin/empathy_ratings_router.py:170`

---

## Tabla resumen (todos los endpoints)

| Método | Path | Auth | Audit log |
|---|---|---|---|
| GET | /api/v1/health | pública | — |
| POST | /api/v1/auth/register | pública | user_register |
| POST | /api/v1/auth/login | pública | login / user_login / user_login_failed |
| POST | /api/v1/auth/forgot-password | pública | password_reset_requested |
| GET | /api/v1/auth/reset-password/{token} | pública | — |
| POST | /api/v1/auth/reset-password | pública | password_reset_completed |
| PUT | /api/v1/auth/change-password | JWT | ⚠ no-audit (pendiente) |
| GET | /api/v1/consent-versions/active | JWT | — |
| POST | /api/v1/consents | JWT (student) | consent_granted |
| PATCH | /api/v1/consents/current | JWT (student) | consent_* |
| GET | /api/v1/users/me/consent-status | JWT | — |
| GET | /api/v1/users/me | JWT | — |
| DELETE | /api/v1/users/me | JWT (student) | user_delete |
| GET | /api/v1/users/me/export | JWT (student) | export_data |
| GET | /api/v1/preferences/me | JWT (student) | — |
| PUT | /api/v1/preferences | JWT (student) | — |
| POST | /api/v1/sessions | JWT + consent | — |
| GET | /api/v1/sessions | JWT + consent | — |
| GET | /api/v1/sessions/{id} | JWT + consent | — |
| PATCH | /api/v1/sessions/{id} | JWT + consent | — |
| POST | /api/v1/sessions/{id}/greeting | JWT + consent | — |
| POST | /api/v1/sessions/{id}/messages (SSE) | JWT + consent | — (eventos vía safety_events) |
| GET | /api/v1/sessions/{id}/messages | JWT + consent | — |
| GET | /api/v1/sessions/{id}/rating | JWT + consent | — |
| PUT | /api/v1/sessions/{id}/rating | JWT + consent | session_rated (si cambia) |
| POST | /api/v1/messages/{id}/reports | JWT + consent | — |
| GET | /api/v1/messages/{id}/reports/check | JWT + consent | — |
| POST | /api/v1/safety-events | JWT + consent | — |
| GET | /api/v1/system-config/sos | JWT | — |
| POST | /api/v1/asr/transcribe | JWT + consent | — |
| GET | /api/v1/tts/synthesize | JWT + consent | — |
| POST | /api/v1/users/me/history/toggle-off | JWT (student) | history_toggle_off |
| POST | /api/v1/users/me/history/toggle-on | JWT (student) | history_toggle_on |
| PATCH | /api/v1/sessions/{id}/hide | JWT (student) | session_hidden (si cambia) |
| DELETE | /api/v1/sessions/{id} | JWT (student) | session_deleted_hard |
| DELETE | /api/v1/users/me/messages | JWT (student) | user_messages_hard_delete |
| GET | /api/v1/llm/health | JWT | — |
| GET | /api/v1/admin/users | admin | — |
| GET | /api/v1/admin/users/cohorts | admin | — |
| POST | /api/v1/admin/users/bulk-action | admin | disable_user/enabled/deleted (×N) |
| GET | /api/v1/admin/users/{id} | admin | view_user |
| DELETE | /api/v1/admin/users/{id} | admin | delete_user |
| PATCH | /api/v1/admin/users/{id}/disable | admin | disable_user |
| PATCH | /api/v1/admin/users/{id}/enable | admin | enable_user |
| PATCH | /api/v1/admin/users/cohort/bulk | admin | update_cohort (bulk) |
| PATCH | /api/v1/admin/users/{id}/cohort | admin | update_cohort |
| GET | /api/v1/admin/reports | admin | — |
| GET | /api/v1/admin/reports/export.csv | admin | export_data |
| PATCH | /api/v1/admin/reports/{id} | admin | review_report |
| GET | /api/v1/admin/safety-events | admin | — |
| GET | /api/v1/admin/safety-events/export.csv | admin | export_data |
| PATCH | /api/v1/admin/safety-events/{id} | admin | review_safety_event |
| GET | /api/v1/admin/dashboard | admin | — |
| GET | /api/v1/admin/metrics/usage | admin | — |
| GET | /api/v1/admin/metrics/wellbeing | admin | — |
| GET | /api/v1/admin/metrics/technical | admin | — |
| GET | /api/v1/admin/metrics/safety | admin | — |
| GET | /api/v1/admin/metrics/study | admin | — |
| GET | /api/v1/admin/metrics/export.csv | admin | export_data |
| GET | /api/v1/admin/config | admin | — |
| PATCH | /api/v1/admin/config/{key} | admin | change_config |
| GET | /api/v1/admin/consent-versions | admin | — |
| POST | /api/v1/admin/consent-versions | admin | change_config (create) |
| POST | /api/v1/admin/consent-versions/{id}/publish | admin | change_config (publish) |
| DELETE | /api/v1/admin/consent-versions/{id} | admin | change_config (delete_draft) |
| GET | /api/v1/admin/services-health | admin | — |
| GET | /api/v1/admin/llm-info | admin | — |
| POST | /api/v1/admin/config/gemini/test | admin | change_config (gemini_test) |
| GET | /api/v1/admin/logs | admin | — |
| GET | /api/v1/admin/logs/export.csv | admin | export_data |
| GET | /api/v1/admin/empathy-ratings/queue | admin | — |
| POST | /api/v1/admin/empathy-ratings | admin | empathy_rate |
| GET | /api/v1/admin/empathy-ratings/rated | admin | — |
| PATCH | /api/v1/admin/empathy-ratings/{id} | admin | empathy_rate_updated |
| GET | /api/v1/admin/empathy-ratings/stats | admin | — |

**Total: 75 endpoints** (1 health `@app.get` en `main.py:95` + 37 estudiante/sistema en 12 routers + 37 admin en 7 routers = 75).

---

## Errores cross-cutting

Errores comunes que cualquier endpoint puede retornar incluso cuando no estén listados explícitamente arriba:

| Status | Cuándo | Body |
|---|---|---|
| 401 | `Authorization` ausente o token inválido / expirado | `{"detail": "No autenticado"}` o `{"detail": "Token invalido"}` o `{"detail": "Token expirado"}` |
| 403 | Cuenta deshabilitada (`disabled_at != null`) | `{"detail": "Cuenta deshabilitada"}` |
| 403 | Role insuficiente (`require_role`) | `{"detail": "Acceso denegado"}` |
| 403 | Consent insuficiente (`require_consent`) | `{"detail": {"message": "Consentimiento requerido", "consent_status": "no_consent | revoked | new_version_required"}}` |
| 404 | Recurso no encontrado | `{"detail": "<recurso> no encontrado"}` |
| 422 | Validación Pydantic falla | shape `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` (FastAPI default) |
| 500 | Excepción no manejada | log al backend; el cliente recibe el detalle del except branch correspondiente o un default genérico |

---

## SSE endpoint detallado — `POST /sessions/{id}/messages`

Único endpoint streaming del sistema. Implementado con `EventSourceResponse` (vía `StreamingResponse(media_type="text/event-stream")`).

### Formato de events

Cada event es una línea `data: <json>\n\n`. El JSON no está bajo una key envolvente fija — el cliente debe inspeccionar las keys:

1. **Pre-filter guardrail** (opcional, primer event si aplica):
   ```
   data: {"risk_detected": true, "severity": 3}

   ```
2. **Tokens del LLM** (uno por chunk del provider):
   ```
   data: {"token": "Hola"}

   data: {"token": ", "}

   data: {"token": "¿cómo"}

   ```
3. **Error** (terminal, opcional — si el stream falla):
   ```
   data: {"error": "Mabel necesita una pausa breve (limite del proveedor alcanzado). Intenta de nuevo en unos minutos."}

   ```
   Casos detectados: 429/rate-limit, 401/api-key, timeout, cold-start, model-not-found, connect/network. Default: `"Error al generar respuesta (<ExceptionType>). Intenta de nuevo o avisa al administrador si persiste."`
4. **Done** (terminal, siempre que no haya error):
   ```
   data: {"done": true, "message_id": "<uuid | null>", "latency_ms": 1234, "risk_detected": true (opcional)}

   ```
   `message_id` es null si `save_history=false`.

### Reconnect

**No implementado**. El stream es one-shot. Si el cliente se desconecta:
- Los messages `user` ya quedaron persistidos (commit ocurre ANTES del stream LLM).
- El message `assistant` se persiste DESPUÉS del stream completo solo si `save_history=true`.
- El cliente debe iniciar una nueva request si quiere retry — el LLM se ejecutará de nuevo (no idempotente).

### Ejemplo de cliente (fetch + ReadableStream)

```js
const res = await fetch('/api/v1/sessions/<id>/messages', {
  method: 'POST',
  headers: {'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json'},
  body: JSON.stringify({content: 'hola', voice_mode: false}),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const {value, done} = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, {stream: true});
  const lines = buffer.split('\n\n');
  buffer = lines.pop(); // último parcial
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const evt = JSON.parse(line.slice(6));
    if (evt.token) append(evt.token);
    else if (evt.error) showError(evt.error);
    else if (evt.done) finalize(evt);
  }
}
```

---

## Voice endpoints — notas operativas

### `POST /asr/transcribe` (multipart upload)

- Body: `multipart/form-data` con un campo `audio` (File). Formato típico: webm/opus desde MediaRecorder, también acepta wav/mp3.
- El archivo se persiste a `settings.UPLOAD_DIR` con nombre `{uuid}.{ext}`. Si NO se va a retener (no hay session_id, o `save_history=false`), el archivo se elimina post-transcripción.
- El frontend captura desde `useAudioRecorder` y dispara el POST al soltar el botón.

### `GET /tts/synthesize` (streaming binario)

- Acepta `text` como query string (max 5000 chars). Esto permite usarlo como `src` de un `<audio>` HTML directamente con el JWT en el header (vía `audio.fetch + URL.createObjectURL`).
- Devuelve `audio/wav` binario inline.
- Latencia depende del tamaño del texto (Piper local ≈ 100-400ms por frase corta).

---

## Admin RBAC — garantías

1. **Backend**: cada endpoint admin usa `Depends(require_admin)` = `require_role("admin")`. La dependency lee el JWT, valida usuario activo (no eliminado, no deshabilitado), y verifica `user.role == "admin"`. Falla con 401 (no auth) o 403 (no admin).
2. **Frontend**: `RoleGuard` (`frontend/src/guards/RoleGuard.tsx`) redirige a `/` si el usuario autenticado no tiene rol admin. Es defensa en profundidad — el backend es la fuente real.
3. **No hay rate-limit por rol** en el MVP (CHECK constraints de DB + invariantes de servicio actúan como salvaguardas).
4. **Admins NO firman consent**: `require_consent` retorna inmediatamente para `role=admin` (middleware/auth.py:76). Esto permite que un admin opere sin tener un `consent` activo.
5. **Audit chains**: cada mutación admin produce un `audit_logs` row con `actor_id=admin.id`, `actor_role="admin"`, `ip`, `details`. Esto cubre Ley 1581 art. 25 (registro de operaciones).

---

## Regenerar este catálogo

```bash
# 1. Ver registro de routers
grep -n "include_router" backend/app/main.py

# 2. Enumerar todos los handlers
grep -rEn '^@router\.(get|post|put|patch|delete)' backend/app/routers/ \
  | sed 's/.*@router\.//' | sort

# 3. Obtener el OpenAPI vivo (requiere backend corriendo)
cd backend && uvicorn app.main:app --port 8000 &
curl http://localhost:8000/openapi.json | jq .paths

# 4. Listar schemas
ls backend/app/schemas/
```

Para recontar:
```bash
grep -rcE '^@router\.(get|post|put|patch|delete)' backend/app/routers/
```

---

## Drift / pendientes

Hallazgos al hacer este catálogo (2026-05-24):

1. **`/auth/forgot-password`** — `reset_link` en la respuesta solo aplica para dev. En prod debería ser `null` siempre (decisión: enviar por email). El campo se mantiene en el DTO porque facilita el testing local.
2. **`POST /sessions/{id}/messages` (SSE)** — no usa `EventSourceResponse` formalmente sino `StreamingResponse(media_type="text/event-stream")` con generator manual `f"data: {chunk}\n\n"`. Funciona pero no provee heartbeats (`: ping` cada N segundos). Si el cliente está detrás de un proxy con timeout corto, una respuesta muy larga + LLM lento podría romper el stream sin que el cliente sepa el por qué.
3. **`PATCH /sessions/{session_id}`** — usa union type `UpdateSessionCheckin | UpdateSessionEnd`. FastAPI/Pydantic discrimina por shape, pero un body ambiguo (que tenga ambos `action="end"` y `checkin_payload`) caerá en la primera rama válida. La UI nunca manda esto, pero un cliente externo podría confundirse — considerar discriminated union explícito con tag (`type: "checkin" | "end"`).
4. **`POST /asr/transcribe`** — `session_id` se documenta como query param pero FastAPI lo acepta también como form field. No hay test cobertura explícita de ambos paths.
5. **Endpoints admin metrics** — los responses son `dict[str, Any]` sin DTO formal. Documentado en el código como "shape Tab X" pero el contrato real vive en el frontend (`api/admin.ts`). Refactor sugerido: extraer DTOs `MetricsUsageResponse`, `MetricsWellbeingResponse`, etc. en `schemas/admin.py`.
6. **`POST /admin/empathy-ratings`** — no hay endpoint para LISTAR ratings propios sin contexto (`/rated` siempre incluye el mensaje + preceding). Si una IA externa necesita solo el rating raw, debe usar `/rated` y descartar campos.
7. **`GET /admin/empathy-ratings/stats`** — sin DTO formal (responde `dict[str, Any]`). Mismo issue que metrics: contrato real vive en el frontend.
8. **`PATCH /admin/config/{key}`** — el `X-Study-Lock-Override` header es informal y solo respetado por este endpoint. No documentado en OpenAPI generado.
9. **Estado `triaged`** — `triaged_at` aparece en `ReportAdminItem` pero la transición es manual vía PATCH y no se documenta en respuesta de éxito. La UI lo infiere del nuevo `status`.
10. **Audit log actions** — la lista completa de `action` strings no está enumerada en ningún DTO ni constante; cada router/service emite el string literal. Considerar un enum compartido para evitar typos silenciosos.

---

**Fin del catálogo.**
