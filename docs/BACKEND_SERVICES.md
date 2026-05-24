# Catálogo Backend — Services / Repositories / Middleware — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `899bd44`
> **Fuente de verdad**: este archivo + `backend/app/services/*` + `backend/app/repositories/*`
> **API endpoints**: `docs/API_REFERENCE.md`
> **Schema BD**: `docs/DB_SCHEMA.md`

---

## 1. Arquitectura (resumen)

Patrón estricto de capas: **router → service → repository → modelo SQLAlchemy → BD**.

| Capa | Responsabilidad | Lo que NO hace |
|---|---|---|
| **Router** (`backend/app/routers/*`) | Deserializa request, llama servicio, serializa respuesta. Mapea `ValueError("CODE")` a `HTTPException(status_code=...)`. | Lógica de negocio, queries SQL, validación cruzada de invariantes. |
| **Service** (`backend/app/services/*`) | Lógica de negocio. Orquesta repositorios, emite `audit_log_action`, llama LLM/voice subprocess, valida invariantes que requieren BD (UNIQUE consents, propiedad de sesiones, etc.). Decide cuándo commitear (D-12). | Inyectar/leer headers HTTP, formatear JSON. |
| **Repository** (`backend/app/repositories/*`) | Data access puro: `SELECT`, `INSERT`, `UPDATE`, `DELETE`. Devuelve modelos ORM. **Nunca** commitea por sí solo (D-12 desde 2026-05-23); sólo flushea. | Lógica de negocio. Audit log. Cross-table business rules. |
| **Modelo** (`backend/app/models/*`) | SQLAlchemy 2.0 declarativo. Refleja DDL de `db/schema_postgresql.sql`. | Métodos de negocio. |

Decisión rectora **D-12 (atomicidad)**: cada acción auditable + su `audit_logs` row deben persistirse en una sola transacción. Por eso casi todos los repos terminan con `await db.flush()` (no `commit()`) y el servicio cierra con un único `await db.commit()` después del audit. Excepciones documentadas abajo (sección 9).

---

## 2. Services (`backend/app/services/`)

### 2.1 `account_service.AccountService` (179 líneas)

**Propósito**: operaciones del propio usuario sobre su cuenta — borrar, cambiar contraseña, exportar datos.

**Constructor**: `AccountService(user_repo: UserRepository, db: AsyncSession)`

**Métodos**:

- `async delete_account(user_id, confirmation: str, ip)` — Hard DELETE de la cuenta. Exige `confirmation == "ELIMINAR"` (envuelto en el router con texto en UI). Snapshot del email **antes** del DELETE para preservarlo en `audit_logs.details`; escribe el audit **antes** del DELETE para que el FK `actor_id` siga siendo válido al hacer `INSERT` (CASCADE/SET NULL lo nulificará después por `Evo 005b`). Errores: `INVALID_CONFIRMATION`, `USER_NOT_FOUND`.
- `async change_password(user, current_password, new_password)` — Verifica `current_password` con bcrypt (`bcrypt.checkpw`), rechaza si es igual al nuevo, hashea con `bcrypt.gensalt(rounds=12)` y delega a `user_repo.update_password`. Errores: `WRONG_PASSWORD`, `SAME_PASSWORD`.
- `async export_data(user_id, fmt: "json"|"csv")` — Construye un dump de los datos del usuario: cuenta, consentimiento activo (con JOIN a `consent_versions.version`), preferencias, y **contadores** (no contenido) de sesiones/mensajes/reportes. Si `fmt=="csv"`, aplana via `_to_csv()` (helper estático interno, escritura a `io.StringIO`).

**Repos**: `UserRepository`. Hace queries directas sobre `Consent`, `ConsentVersion`, `Preference`, `Session`, `Message`, `MessageReport` (bypass de repo — el dump es read-only).

**Audit actions emitidas**: `user_delete` (actor_role=`student`).

**Side effects**: ninguno fuera de BD.

**Notas no-evidentes**:
- En `delete_account`, el orden es **audit_log_action() → user_repo.delete()**. Invertirlo dejaría una ventana donde el `actor_id` ya no existe y el INSERT del audit fallaría por FK.
- `_to_csv` aplana dicts anidados con prefijo `"section.key"`. Booleans y `None` se serializan como string.

---

### 2.2 `asr_service.AsrService` (26 líneas)

**Propósito**: transcripción de voz → texto via faster-whisper (CPU, int8).

**Constructor**: no toma deps (stateless). El servicio se instancia por request en el router; el modelo Whisper es un singleton de módulo (`_model`).

**Métodos**:
- `transcribe(file_path: str) -> str` — síncrono (faster-whisper expone API bloqueante). Carga el modelo perezosamente la primera vez (`compute_type="int8"`, `device="cpu"`, idioma fijo `es`).

**Side effects**: lectura del archivo de audio en `file_path`, descarga del modelo Whisper la primera vez.

**Notas no-evidentes**:
- `WhisperModel` se importa **dentro** de `_get_model()` para no pagar el costo de import (~2s) en arranques que no usan ASR (workers de migraciones, scripts).
- El modelo se mantiene en RAM entre requests; bajo `uvicorn --reload` se reconstruye en cada reload.

---

### 2.3 `audit_service` — módulo (no clase) (97 líneas)

**Propósito**: writer del audit log + whitelist de acciones permitidas.

**Constante pública**:
- `ALLOWED_ACTIONS: frozenset[str]` — **vocabulario completo y canónico** de las 27 acciones permitidas (`audit_service.py:19-50`):
  - **Admin (13)**: `login`, `view_user`, `disable_user`, `enable_user`, `delete_user`, `update_cohort`, `change_config`, `review_report`, `review_safety_event`, `export_data`, `empathy_rate`, `empathy_rate_updated`, `update_system_config`.
  - **Student auth/consent/account (8)**: `user_register`, `user_login`, `user_login_failed`, `user_delete`, `consent_granted`, `consent_revoked`, `password_reset_requested`, `password_reset_completed`.
  - **Student control de datos (5, mig 012)**: `history_toggle_off`, `history_toggle_on`, `session_hidden`, `session_deleted_hard`, `user_messages_hard_delete`.
  - **Student rating (1, mig 011)**: `session_rated`.
  - Validación de la coherencia `(actor_role, action)` se delega al CHECK constraint Postgres `audit_logs.actor_role`.

**Función pública**:
- `async audit_log_action(db, *, actor_id, actor_role: "admin"|"student"|"system", action, target_type=None, target_id=None, details=None, ip=None)` — Inserta un `audit_logs` dentro de la transacción del caller. **NO commitea** (D-12). Kwargs-only: el `*` fuerza pasar `actor_role` explícito; el cambio (Evo 008) eliminó el `="admin"` por default que enmascaraba sites nuevos student/system.

**Notas no-evidentes**:
- No hay validación application-side de `action ∈ ALLOWED_ACTIONS`: la constante existe como documentación viva del vocabulario, pero el gate real es el CHECK constraint de Postgres.

---

### 2.4 `auth_service.AuthService` (203 líneas)

**Propósito**: registro, login, reset de contraseña, emisión y verificación de JWTs.

**Constantes de módulo**: `JWT_ALGORITHM="HS256"`, `JWT_EXPIRY_HOURS=24`, `JWT_EXPIRY_REMEMBER_DAYS=7`.

**Constructor**: `AuthService(user_repo: UserRepository, password_reset_repo: PasswordResetRepository)`.

**Métodos estáticos** (utilidades crypto):
- `hash_password(password) -> str` — bcrypt 12 rounds
- `verify_password(password, hashed) -> bool`
- `create_jwt(user_id, role, remember_me=False) -> str` — payload `{sub, role, exp}` con `settings.JWT_SECRET`
- `decode_jwt(token) -> dict`

**Métodos async**:
- `register(email, password, display_name, ip) -> UserResponse` — Crea usuario + emite `user_register` audit en una sola transacción (D-12 estricto: `user_repo.create()` sólo flushea, `auth_service.register` commitea una vez después del audit). Error: `DUPLICATE_EMAIL`.
- `login(email, password, remember_me=False) -> LoginResponse` — Rechaza `deleted_at != NULL` y `disabled_at != NULL` (esta última con `DISABLED:{reason}`). Error: `INVALID_CREDENTIALS`. **No** emite audit log aquí — el router emite `user_login` o `user_login_failed`.
- `forgot_password(email) -> (ForgotPasswordResponse, user_id|None)` — Anti-enumeración D-03: la response es idéntica exista o no el email. Tokens disabled/deleted se tratan como inexistentes. Devuelve el `user_id` real al router sólo para que pueda escribir un `password_reset_requested` audit. **NO devuelve `reset_link` en la response** — comentario explícito: ese leak permitía takeover de cuentas en el flujo MVP. El token raw se persiste hasheado SHA-256 en `password_reset_tokens`; el plaintext debe viajar por correo (cuando se cablee SMTP) o consultarse en BD manualmente.
- `validate_reset_token(raw_token) -> TokenValidationResponse` — Hashea SHA-256, busca; reporta `invalid` o `expired` sin distinguirlos en HTTP (también anti-enumeración).
- `reset_password(request) -> uuid.UUID` — Devuelve `user_id` para que el router emita `password_reset_completed` sin lookup extra. Errores: `INVALID_TOKEN`, `EXPIRED_TOKEN`.

**Audit emitidos por el router (no por el service)**: `user_login`, `user_login_failed`, `password_reset_requested`, `password_reset_completed`. Emitido por el service: `user_register`.

**Side effects**: ninguno fuera de BD + entropía (`os.urandom(32).hex()` para tokens).

---

### 2.5 `chat_service.ChatService` (655 líneas — núcleo del producto)

**Propósito**: orquesta el ciclo completo de chat — creación de sesiones, check-in, contexto, llamadas al LLM (streaming), guardrails pre/post, persistencia de mensajes, manejo de greeting con race-protection, modo voz, y atribución de tokens.

**Constructor**: `ChatService(session_repo, message_repo, preference_repo, llm: LLMProvider, guardrails=None)`.

**Métodos públicos** (todos `async`):

#### `create_session(user_id, topic_hint=None, checkin_payload=None) -> (session, previous_closed)`
**Lazy-creation pattern (2026-05-23)**: la sesión nace cuando hay acción real del estudiante (envío de check-in o primer mensaje). Si `checkin_payload` viene, la sesión se crea con el check-in completado en la misma transacción → cero ventana de "sesión huérfana sin check-in".

Maneja el `IntegrityError` por violación del UNIQUE constraint `uq_sessions_user_active`: rollback → `close_active()` → retry → setea `previous_closed=True`. Único commit al final.

#### `list_sessions(user_id)`, `get_session(session_id, user_id)`, `update_checkin(...)`, `end_session(...)`
Operaciones de ciclo de vida. Validación de propiedad (`session.user_id != user_id → ACCESS_DENIED`). `update_checkin` rechaza `SESSION_ENDED` y `CHECKIN_ALREADY_COMPLETED`.

#### `send_message(session_id, user_id, content, voice_mode=False) -> AsyncGenerator[str, None]`
Pipeline principal. Yields strings JSON parciales que el router envuelve en SSE.

1. **Validación**: get_session, rechaza `SESSION_ENDED`.
2. **Pre-filter guardrails**: si `self.guardrails`, llama `pre_filter(content, session_id, user_id)`. Si detecta riesgo, yieldea inmediatamente `{"risk_detected": true, "severity": N}` (el frontend puede abrir el panel SOS antes de esperar al LLM).
3. **Persistencia user message** (solo si `prefs.save_history`): hash SHA-256 + safety_flags + commit.
4. **Build context window**: si `save_history` → últimos `CONTEXT_WINDOW_SIZE=20` mensajes; si no → sólo el turno actual.
5. **System prompt branching** (clave): `is_mabel_gemma4()` decide.
   - Mabel-Gemma4: prompt fijo del fine-tuning + el check-in se inyecta como **prefijo del primer user turn de la ventana** via `_inject_checkin_into_first_user_turn` (durabilidad: aunque la ventana deslice, cada llamada re-aplica el prefijo sobre el `oldest-user-in-window`).
   - Modelo genérico (Gemini/OpenAI): `MABEL_SYSTEM_PROMPT` + check-in inline en el system.
6. **Voice mode adjustments**: si `voice_mode` y NO es Gemma4, anexa `_voice_mode_system_suffix()` con reglas de prosodia TTS (sin markdown, sin emojis, interjecciones suaves, etc.). Siempre limpia markdown del historial assistant via `_strip_assistant_markdown()` para evitar que el modelo mirroree formato del pasado.
7. **Stream LLM**: `await for token in self.llm.generate_stream(messages, system_prompt, usage_sink={})`. Yieldea cada token como `{"token": "..."}`.
8. **Error mapping**: catch `ValueError` y mapea a mensajes accionables por código (`429`, `401`, `timeout`, `cold start`, `model not found`, `connect/network`). Loguea con `logging.exception`. Yieldea `{"error": "..."}` y `return`.
9. **Post-filter guardrails** sobre `full_response`.
10. **Persistencia assistant** (si `save_history` y respuesta no vacía): incluye `latency_ms`, `llm_latency_ms` (igual al total para chat texto-only — Fase 8.1 D-03), `tokens_prompt/completion` desde `usage_sink`, `meta={"model": settings.LLM_MODEL}`, safety_flags.
11. Yield `done` payload con `message_id`, `latency_ms`, y `risk_detected` si aplica.

#### `generate_greeting(session_id, user_id, voice_mode=False) -> dict | None`
Genera el primer mensaje de Mabel al abrir una sesión con check-in completado.

**Race protection** (clave): el frontend (React StrictMode) puede disparar el endpoint dos veces. El `if existing: return None` al inicio NO es atómico. La protección real es el partial UNIQUE INDEX `uq_messages_session_greeting` (`role='assistant' AND meta->>'greeting' = 'true'`) — el segundo INSERT raise `IntegrityError`, se rollbackea y se devuelve `None`.

**Token attribution para el race-loser**: aunque el INSERT perdió, el LLM ya cobró por `usage_sink`. Para no sub-reportar costo, se hace UPDATE atómico al ganador con `func.coalesce(Message.tokens_prompt, 0) + :delta` (SQL-side increment — Python read-modify-write perdería deltas con 3+ requests concurrentes).

**Instrucción de greeting**: construye bullets a partir del check-in con `_ENERGY_LABEL`, `_STRESS_LABEL`, `_LONELINESS_LABEL`, `_SLEEP_QUALITY_LABEL`. Rechazo explícito de bools en `isinstance(mood, (int, float))` para no producir "Ánimo: True/10". Soporta `focus` como string (legacy) o list (multi-select post-2026-05-23). El instruction explicita el plan: saluda → resume con empatía → recoge nota libre/foco adicional → pregunta abierta.

#### `list_messages(session_id, user_id)`
Validación de propiedad + delegate a `message_repo.list_by_session`.

**Repos**: `SessionRepository`, `MessageRepository`, `PreferenceRepository`. Inyecta `LLMProvider` y `GuardrailsService` opcional.

**Audit actions emitidas**: ninguna directamente (los routers emiten `session_rated`, `session_hidden`, `session_deleted_hard` para acciones sobre sesiones; el chat per se no audita).

**Side effects**: streaming LLM (network), guardrails (BD: `safety_events`).

**Notas no-evidentes**:
- `_voice_mode_system_suffix` es ~58 líneas de texto literal con reglas de prosodia muy específicas (números en letras, pausas con comas, interjecciones).
- `_strip_assistant_markdown` aplica 9 regex (bold/italic/code/headers/bullets/links).
- `_inject_checkin_into_first_user_turn` muta solo el primer user turn de la ventana (no de la sesión).

---

### 2.6 `consent_eligibility` — módulo (150 líneas)

**Propósito**: filtro **única fuente de verdad** de qué `user_ids` son research-eligible (consentimiento activo con `scope='uso_mejora_anon'`).

**Constante**: `RESEARCH_SCOPE = "uso_mejora_anon"`.

**Función pública única**:
- `async get_research_eligible_user_ids(db) -> list[uuid.UUID]` — Window function `row_number() OVER (PARTITION BY user_id ORDER BY accepted_at DESC)` para tomar el "último consentimiento no revocado" por usuario. JOIN defensivo `User.role != 'admin'` (admins nunca son cohorte de estudio).

**Behavior across consent-version transitions** (intencional): NO exige que el último consent apunte a la versión activa actual. Si un usuario aceptó v1.0 con `uso_mejora_anon` y el admin publica v2.0, sigue siendo eligible hasta que re-acepte (o revoque). Razón operativa: publicar v2.0 no debe "blanquear" el dashboard de métricas.

**Surfaces filtradas** (documentado en docstring): `AdminMetricsService.metrics_usage/wellbeing/technical/study/safety`, `export_csv`, `dashboard_kpis` (parte agregada), `AdminEmpathyService.get_queue/list_rated`.
**Surfaces NO filtradas**: `audit_logs`, `safety_events` (D-14), `message_reports` admin queue, KPIs operacionales del dashboard.

---

### 2.7 `consent_service.ConsentService` (223 líneas)

**Propósito**: aceptar/revocar/reducir-scope/re-aceptar consentimientos atómicamente con su audit.

**Constructor**: `ConsentService(consent_repo, version_repo, db: AsyncSession)`. `db` es **requerido** (no Optional) desde 2026-05-23 — la versión anterior aceptaba None y silently skippeaba el audit log.

**Métodos**:
- `async get_active_version() -> ConsentVersionResponse | None`
- `async accept_consent(user_id, consent_version_id, scope, ip)` — Valida `version.status=='active'`, rechaza duplicado. INSERT + audit `consent_granted` + commit único.
- `async patch_consent(user_id, action, scope, ip)` — Dispatcher para `action ∈ {"re-accept", "reduce-scope", "revoke"}`. Cada branch tiene sus precondiciones (`ALREADY_ACTIVE`, `CONSENT_REVOKED`, `ALREADY_SOLO_USO`, `ALREADY_REVOKED`, `SCOPE_REQUIRED`).
- `async get_consent_status(user_id) -> ConsentStatusResponse` — Devuelve uno de `{ok, no_consent, revoked, new_version_required}`. Comentario importante: NO discrimina por `role` aquí — el caller (`middleware.auth.require_consent`) ya hace short-circuit para `role=='admin'` antes de invocarlo.

**Audit actions emitidas**: `consent_granted`, `consent_revoked`.

**Notas no-evidentes**:
- Helper interno `_audit_consent_change` centraliza el audit+commit para reducir duplicación en las 3 branches de `patch_consent`.

---

### 2.8 `guardrails_service.GuardrailsService` (133 líneas)

**Propósito**: pre/post-filter de mensajes contra keywords de seguridad con severity scoring.

**Constructor**: `GuardrailsService(config_repo, event_repo)`.

**Métodos**:
- `async pre_filter(content, session_id, user_id) -> dict` — Si `guardrails_enabled=False`, return early. Si detecta, persiste `safety_events.event_type='risk_detected'` con `payload={keywords, severity, message_id=None, filter='pre'}`, commitea, y devuelve `{risk_detected, severity, keywords}` donde `risk_detected = severity >= threshold`.
- `async post_filter(content, session_id, user_id, message_id=None) -> dict` — Idéntico al pre pero con `filter='post'` y opcionalmente `message_id`.
- `async _analyze(content) -> dict` — Substring-match contra `safety_keywords` configuradas. **Severity policy**:
  - Cualquier keyword con `critical=True` → severity = **5** (auto-SOS regardless de cuántos matcharon).
  - Keywords no-críticas acumulan +1, capped at **4** (deja headroom: 5 queda reservado al bucket crítico).
  - 100% data-driven: no hay lista hardcoded. Admins manejan vocabulario en `/admin/config` §02.

**Repos**: `SystemConfigRepository`, `SafetyEventRepository`.

**Audit**: ninguno (los `safety_events` SON el evento de auditoría de seguridad).

---

### 2.9 `history_service.HistoryService` (235 líneas)

**Propósito**: control de historial (soft-hide vs hard-delete) con **ramificación por scope de consentimiento**. Implementa `docs/DATA_RETENTION_POLICY.md`.

**Compliance crítico (B-04, 2026-05-23)**: si el usuario firmó `scope='solo_uso'`, el toggle OFF de "Guardar historial" debe ejecutar **hard DELETE real** en lugar de soft-hide — `solo_uso` no autoriza retención. Esta ramificación vive aquí (no en BD) porque depende del `consents.scope` actual.

**Constructor**: `HistoryService(db: AsyncSession)`.

**Patrón D-12**: ningún método commitea. El router envuelve acción + audit + commit único.

**Métodos**:
- `async hide_session(session_id, user_id) -> (session, changed: bool)` — Soft-hide individual. `changed=False` si ya estaba oculta (idempotente; el flag previene audit log duplicados en doble-click — code-review #4).
- `async hard_delete_session(session_id, user_id) -> int` — Hard DELETE de una sesión + sus messages (CASCADE). Devuelve `messages_count` contado antes del DELETE (para audit details).
- `async apply_history_toggle_off(user_id) -> dict` — Aplica toggle OFF masivo. Ramifica:
  - `solo_uso` (o sin consent) → hard DELETE de TODAS las sesiones del usuario.
  - `uso_mejora_anon`/`uso_investigacion` → soft hide masivo (`hidden_at=NOW()`, `hidden_reason='user_toggle_off'`).
  Devuelve `{behavior, scope, affected_sessions, deleted_messages}`.
- `async hard_delete_all_user_messages(user_id) -> dict` — Endpoint "Eliminar mis datos": hard DELETE de todas las sesiones+messages preservando user/preferences/consents (Ley 1581 art. 8 lit. e).

**Helpers internos**:
- `_get_active_scope(user_id) -> str | None` — Lee scope del consent activo más reciente.
- `_scope_allows_retention(scope) -> bool` — True solo si `scope in ("uso_mejora_anon", "uso_investigacion")`.
- `_get_owned_session(session_id, user_id)` — Query directa (NO usa `SessionRepository` que filtra hidden por default — necesario para hide/delete una sesión ya oculta).

---

### 2.10 `preference_service.PreferenceService` (26 líneas)

**Propósito**: upsert de preferences del usuario.

**Constructor**: `PreferenceService(repo: PreferenceRepository)`.

**Métodos**:
- `async get_preferences(user_id) -> Preference | None`
- `async upsert_preferences(user_id, data: UpdatePreferencesRequest)` — Filtra campos `None` del DTO, hace UPDATE o INSERT.

**Notas**: `PreferenceRepository` SÍ commitea internamente (no D-12 estricto aquí — es una operación atómica simple sin audit log asociado).

---

### 2.11 `report_service.ReportService` (64 líneas)

**Propósito**: el estudiante reporta un mensaje del assistant.

**Constructor**: `ReportService(report_repo, message_repo, session_repo, event_repo)`.

**Métodos**:
- `async create_report(message_id, reporter_id, reason, severity, details)` — Valida `message.role=='assistant'` (no se pueden reportar mensajes propios → `CANNOT_REPORT_OWN_MESSAGE`), valida propiedad de la sesión. Crea `MessageReport` + `safety_events.event_type='user_report'`. Maneja `IntegrityError` → `DUPLICATE_REPORT` (UNIQUE `(message_id, reporter_id)`).
- `async check_report(message_id, reporter_id) -> bool` — Backing del frontend "ya reportado".

**Audit**: ninguno aquí; el `safety_event` actúa como traza.

---

### 2.12 `tts_service` — módulo + clase (118 líneas)

**Propósito**: síntesis Piper subprocess.

**Funciones públicas**:
- `piper_model_path(voice=None) -> Path` — Resuelve `PIPER_MODEL_PATH / f"{voice}.onnx"`. **Single source of truth** compartida con `AdminConfigService.get_services_health` para que health check y runtime resuelvan el mismo path. Usa `Path.resolve()` + operador `/` (no string concat — antes producía `models/pipavoice.onnx`).
- `piper_model_files(voice=None) -> (onnx_path, sidecar_json_path)` — Piper requiere AMBOS archivos. Sidecar build via `parent / f"{name}.json"` (no `with_suffix(".onnx.json")` — multi-dot handling cambió entre versiones de Python).

**Clase**: `TtsService` (no dep injection).

**Método**:
- `synthesize(text, voice=None) -> bytes` — Subprocess.Popen Piper con archivo temporal `.wav` (Piper 1.4.x no soporta `--output-file -`). Timeout 30s. **Kill + wait explícitos** en `TimeoutExpired` (no solo `run(timeout=N)`: onnxruntime threads internos quedaban zombies tras unlink del archivo borrado, acumulándose a OOM bajo burst). Cleanup belt-and-suspenders en `finally`.

---

## 3. Services Admin (`backend/app/services/admin/`)

### 3.1 `config_service` — módulo + clase (678 líneas)

**Propósito**: backing del `/admin/config` — validación de payloads, lifecycle de `consent_versions`, LLM ping/info, health de servicios, uptime.

**Validators libres** (raise `ValueError("INVALID_VALUE: <razón>")`):
- `validate_sos_hotline_numbers(value)` — lista de `{name, number}` con regex `^\d{7,12}$`.
- `validate_safety_keywords(value)` — lista `[{keyword: str (lowercase, no-dupe), critical: bool}]`. **Safety floor crítico**: rechaza lista vacía Y rechaza lista sin ninguna entrada `critical=True` (sin eso, `_analyze` no puede producir severity=5 → SOS automático nunca dispara para ideación).
- `validate_sos_severity_threshold(value)` — int 1..5. Rechazo explícito de bool (subclass de int en Python).
- `validate_guardrails_enabled(value)`, `validate_study_lock_enabled(value)` — booleans.
- `validate_config_value(key, value)` — dispatcher al validator correcto, `INVALID_VALUE: unknown key` si no.

**Clase `AdminConfigService(db)`**:

System config:
- `async list_config()`, `async get_current_value(key)`, `async update_config(key, new_value)` — delega a `SystemConfigRepository`, valida vía `validate_config_value`. No commitea (D-12: el router commitea junto al audit `update_system_config`).

Consent versions:
- `async create_consent_version(version, title, body)` — INSERT en `status='draft'`.
- `async delete_consent_version_draft(version_id) -> SimpleNamespace` — Devuelve SNAPSHOT (NamedSpace, no ORM instance) para evitar identity-map collision al auditar después del DELETE. Errores: `VERSION_NOT_FOUND`, `NOT_DRAFT`, `HAS_REFERENCES` (FK RESTRICT desde `consents` — race con un publish concurrente).
- `async publish_consent_version(version_id)` — Archive cualquier active + promote target a active. Errores: `VERSION_NOT_FOUND`, `ALREADY_ACTIVE`.

LLM info / health:
- `_mask_api_key(raw) -> (masked, is_configured)` — Bullets + last 4 chars. Bullets-only si key < 12 chars (4 chars expuestos serían ≥33% del key).
- `_resolve_active_llm_model()` — Branch por `LLM_PROVIDER`: `gemini_native` → `GEMINI_MODEL`, default → `LLM_MODEL`. **Single source of truth** para que ping y info nunca disagreen.
- `async get_llm_info() -> dict` — Snapshot provider/base_url/model/api_key_masked/timeout_ms/last_test. Valida shape de `last_test` defensivamente.
- `async _persist_last_test(payload)` — UPSERT `system_config.llm_last_test` envuelto en **SAVEPOINT (`begin_nested`)** para que un fallo aquí no poison la transacción del audit log (D-12 compliance restaurado). Invalida `repo._cache` via `repo.invalidate()` (F10). Swallow + log en exception.
- `async get_services_health() -> dict` — Health checks: DB (`SELECT 1`), LLM (lee `system_config.llm_last_test`), Piper (via `shutil.which('piper')` + `piper_model_files()` para verificar `.onnx` Y `.onnx.json`), faster-whisper (`importlib.util.find_spec`), uptime (`monotonic() - _PROCESS_START_TS`).
- `async gemini_ping() -> dict` — Nombre legacy; resuelve provider activo via `get_llm_provider()`, hace stream de un "ping" con `max_output_tokens=256` (gemini-2.5 quema 50-200 reasoning tokens antes del output). Mide latency, persiste `llm_last_test` (incluye `model` para detectar drift post-restart — F4), devuelve `{ok, latency_ms, model, error, last_test}` (F8: el snapshot persistido en la misma response evita roundtrip extra).

**Helpers de módulo**:
- `_PROCESS_START_TS: float` — Pinneado por `mark_process_started()` desde el FastAPI lifespan (no import time — F7 fix; el import-time se reseteaba bajo re-imports de tests/tooling).
- `mark_process_started()` — Llamado una vez desde `app.main.lifespan`.
- `_format_uptime(seconds)` — "47 s" / "3 h 12 min" / "2 d 5 h".

**Audit actions del config service**: emitidas por el router (`update_system_config`, `change_config`).

---

### 3.2 `empathy_service.AdminEmpathyService` (355 líneas)

**Propósito**: backing del flow de Empathy Ratings — queue de pendientes, creación, listado de calificadas, stats.

**Constructor**: `AdminEmpathyService(db)`. Internamente instancia `EmpathyRatingRepository(db)`.

**RESEARCH SURFACE**: TODOS los métodos filtran por `get_research_eligible_user_ids(db)` (consent-eligibility).

**Métodos**:
- `async get_queue(rater_id, cohort=None, limit=20) -> dict` — Sample random (D-07) de assistant messages NO calificados por `rater_id`. Devuelve `{items, total_pending}` (el total honesto, no solo el batch loaded). Carga sesiones + preceding user message en queries batched.
- `async create_rating(rater_id, message_id, score, criteria, ip)` — Insert + audit `empathy_rate` + commit atómico (D-12). Errores: `INVALID_SCORE`, `ALREADY_RATED` (UNIQUE `(message_id, rater_id)` → 409).
- `async list_rated(rater_id, cohort=None) -> dict` — Ratings de TODOS los raters sobre mensajes de la cohorte (visibilidad cruzada — inter-rater reliability). Cada item lleva `rater_email_masked` y `is_mine`. **Trade-off documentado**: si un usuario revoca consent, el counter "Calificadas (N)" shrinkea visible-mente (purpose-limitation Ley 1581).
- `async update_rating(rating_id, rater_id, score, criteria, ip)` — Ownership strict: solo el rater original puede editar. Setea `updated_at=now()`. Audit `empathy_rate_updated` con `details.previous`. Errores: `RATING_NOT_FOUND`, `FORBIDDEN`, `INVALID_SCORE`.
- `async get_stats(cohort=None) -> dict` — Delega a `repo.stats(eligible_user_ids=..., cohort=...)`.

**Helper de módulo**:
- `_batch_preceding_user_messages(db, anchors) -> dict[anchor_id, prev_user_content]` — Postgres LATERAL join. Reemplaza loop N+1 que ralentizaba visiblemente la tab Calificadas en pilot scale (~15k ratings).

**Audit emitidas**: `empathy_rate`, `empathy_rate_updated`.

---

### 3.3 `metrics_service.AdminMetricsService` (1720 líneas — el más grande)

**Propósito**: agregaciones para dashboard KPIs + 5 tabs de métricas (Uso, Bienestar, Técnicas, Seguridad, Estudio) + export CSV. Implementa D-11 (raw SQL agregaciones, sin caching), D-03 (nunca serializa `messages.content`), D-08 (CSV anonymization sha256[:16]).

**Convenciones de tiempo** (críticas — Bogotá-anchored para no perder 5h de actividad nocturna):
- Constantes: `BOGOTA_TZ = ZoneInfo("America/Bogota")`, `BOGOTA_TZ_NAME = "America/Bogota"`.
- Helpers: `_bogota_today()`, `_date_range(from, to)` (default últimos 30 días), `_to_dt(date, end=False)` (combina con Bogotá-aware tzinfo), `_bogota_day_trunc(col)` / `_bogota_week_trunc(col)` (Postgres `date_trunc('day', col AT TIME ZONE 'America/Bogota')`).

**Constantes de pricing** (informativas, surface en métricas técnicas):
- `GEMINI_PRICE_INPUT_PER_M_USD = 0.075`
- `GEMINI_PRICE_OUTPUT_PER_M_USD = 0.30`

**Constructor**: `AdminMetricsService(db)`. Internamente: `SurveyResponseRepository(db)` + cache `_eligible_ids_cache` (resolved one-shot por request).

**Helpers privados**:
- `_research_eligible_ids()` — lazy load + cache. `None` = no cargado; `[]` = no hay eligibles (distinción intencional para short-circuit).
- `research_user_id_filter(user_id_col)` — devuelve `user_id_col.in_(eligible_ids)` para queries sin JOIN a `User`.

**Métodos públicos**:
- `async dashboard_kpis(cohort=None) -> dict` — KPIs: `total_users`, `users_new_this_week`, `sessions_today`, `safety_events_24h`, `safety_events_active`, `reports_pending`, `latency_avg_ms`, `sessions_per_day_30d`, `mood_distribution_30d`, `latency_per_day_30d`, `safety_events_by_type_30d`, `guardrails_activations_14d`, `last_5_safety_events`, `sus_avg`.
- `async metrics_usage(from_date, to_date, cohort)` — sesiones/día, mensajes/sesión, retention.
- `async metrics_wellbeing(from_date, to_date, cohort)` — distribución mood/sleep/focus, pairs pre-post wellbeing con paired t-test o Wilcoxon según Shapiro-Wilk (Fase 8.1 D-05; skip si `n_paired < 10`).
- `async metrics_technical(from_date, to_date, cohort)` — latencias percentiles, breakdown ASR/TTS/LLM, errores, costo USD (con pricing constants).
- `async metrics_safety(from_date, to_date, cohort)` — infraction_rate, top_keywords.
- `async metrics_study(cohort)` — Tab E "Estudio" — SUS avg (Brooke), empathy distribution (D-06 desde `empathy_ratings`), pct ≥4.
- `async export_csv(tab, from_date, to_date, cohort) -> AsyncGenerator[list[str], None]` — Yieldea filas. Hash16 para `session_id`/`user_id`. Nunca incluye `messages.content`.

**Helpers privados de cálculo** (~13): `_scalar`, `_sessions_per_day`, `_mood_distribution`, `_latency_per_day`, `_safety_events_by_type`, `_guardrails_per_day`, `_sus_scores`, `_wellbeing_pairs`, `_wellbeing_pair_data`, `_session_rating_summary`, `_avg_per_day`.

**Audit**: ninguno (metrics es read-only).

---

### 3.4 `reports_service.AdminReportsService` (273 líneas)

**Propósito**: backing del admin queue de `message_reports`.

**Reglas**:
- D-03: nunca serializa `messages.content`.
- D-07: paginación `{items, total, page, page_size}`.
- D-08: CSV anonymiza ids con `sha256[:16]`.
- D-12: action + audit atómico.
- **State machine**: `open → triaged|dismissed`, `triaged → resolved|dismissed`. Resto raise `INVALID_TRANSITION` (409). Documentación de por qué `open→dismissed` está permitido directo (reports triviales).

**Constructor**: `AdminReportsService(db)`.

**Helpers de módulo**:
- `_split_details(details)` — Parsea el blob `details` distinguiendo contexto del reporter (sin prefijo) vs admin notes con el patrón `[ISO] status: text` (regex `_NOTE_ENTRY_RE`). Sin este split, la UI mis-atribuía las palabras del estudiante como nota admin.
- `_derive_triaged_at(report) -> datetime | None` — Aproxima `triaged_at` desde `updated_at` SOLO si el report fue por triage (`status in ('triaged','resolved')`). Reports `open→dismissed` directos NO reportan `triaged_at` para no inflar la métrica "tiempo promedio hasta triaje".
- `_hash16`, `_truncate_id`, `_to_item`.

**Métodos**:
- `async list_reports(reason, severity, status, from_date, to_date, page, page_size)` — Delega a `MessageReportRepository.list_with_filters`.
- `async update_report_status(report_id, new_status, notes, admin_id, ip)` — Valida transición + delega a repo + audit `review_report` + commit. Errores: `REPORT_NOT_FOUND`, `INVALID_TRANSITION`.
- `async export_csv_rows(filtros..., admin_id, ip)` — Escribe audit `export_data` y commit ANTES de yieldear (para que el audit persista incluso si el cliente desconecta mid-stream).

**Audit**: `review_report`, `export_data`.

---

### 3.5 `safety_events_service.AdminSafetyEventsService` (207 líneas)

**Propósito**: backing admin de `safety_events`.

**Reglas**: D-03 (sanitiza payload), D-07, D-08, D-12.

**State machine**: `active → reviewed`, `reviewed → resolved`. Resto → `INVALID_TRANSITION`.

**Constantes**: `_FORBIDDEN_PAYLOAD_KEYS = frozenset({"content","message","text","raw_message"})` — defensive en caso de que un caller buggy haya almacenado contenido.

**Constructor**: `AdminSafetyEventsService(db)`.

**Helpers de módulo**: `_hash16`, `_truncate_id`, `_extract_severity(payload)`, `_sanitize_payload(payload)`, `_to_item`.

**Métodos**:
- `async list_events(filtros..., page, page_size)` — Delega a `SafetyEventRepository.list_with_filters`.
- `async update_event_status(event_id, new_status, notes, admin_id, ip)` — Valida transición + delega + audit `review_safety_event` + commit. Errores: `SAFETY_EVENT_NOT_FOUND`, `INVALID_TRANSITION`.
- `async export_csv_rows(filtros..., admin_id, ip)` — Audit + commit antes de stream (mismo patrón que reports). CSV hashea `session_id` y `user_id`.

**Audit**: `review_safety_event`, `export_data`.

---

### 3.6 `users_service.AdminUsersService` (711 líneas)

**Propósito**: list/detail/disable/enable/delete/bulk/cohort sobre `users`.

**Reglas**: D-04 (`mask_email`), D-03, D-12 (audit atómico para `view_user`, `disable_user`, `enable_user`, `delete_user`, `update_cohort`).

**Función de módulo**:
- `mask_email(email) -> str` — `f"{local[0]}***@{domain}"`. Maneja `None`, sin `@`, local vacío.

**Constructor**: `AdminUsersService(db)`.

**Helpers privados**:
- `_get_active_version()`, `_get_latest_consent(user_id)`, `_derive_consent_status(latest, active_version_id)`, `_get_session_stats(user_id)`.

**Métodos públicos**:
- `async list_users(q, status, consent_status, created_from/to, cohort, page, page_size) -> (items, total)` — Filtros SQL + (slow path) filtro `consent_status` aplicado en Python (TODO doc: optimizar via `DISTINCT ON`). Para pilot scale (30 users) es aceptable. Fast path: SQL-side count + pagination.
- `async get_user_detail(user_id, admin_id, ip) -> UserAdminDetail | None` — Consent + Preference + stats (sessions, messages, reports filed, safety_events). Audit `view_user` + commit antes de devolver. None si el user no existe.
- `async disable_user(user_id, reason, admin_id, ip)` — Setea `disabled_at=now()`, `disabled_reason`. Audit `disable_user` + commit. Errores: `USER_NOT_FOUND`, `CANNOT_DISABLE_ADMIN`, `ALREADY_DISABLED`.
- `async enable_user(user_id, admin_id, ip)` — Limpia ambos campos. Audit `enable_user` con `details.previous_reason`. Errores: `USER_NOT_FOUND`, `ALREADY_ENABLED`.
- `async delete_user(user_id, admin_id, ip)` — Hard DELETE gated en disable previo. Audit ANTES del DELETE (snapshot identity). Errores: `USER_NOT_FOUND`, `CANNOT_DELETE_ADMIN`, `USER_NOT_DISABLED`.
- `async bulk_action(user_ids, action: "disable"|"enable"|"delete", reason, admin_id, ip) -> dict` — Aplica acción a muchos en UN solo commit. Buckets de skip: `skipped_admin`, `skipped_already_state`, `skipped_must_disable_first` (solo aplica a action='delete' — enforces el two-step), `not_found`. Para delete: two passes (audit+flush primero, deletes después).
- `async set_cohort(user_id, cohort, admin_id, ip)` — Audit `change_config` target_type=`user_cohort` con `details={old, new}`.
- `async set_cohort_bulk(user_ids, cohort, admin_id, ip) -> dict` — Cada user un audit row individual `update_cohort` con `bulk: True`. Skip admin server-side. Devuelve `{updated, unchanged, not_found, skipped_admin}`.

**Audit emitidas**: `view_user`, `disable_user`, `enable_user`, `delete_user`, `change_config`, `update_cohort`.

---

## 4. Services LLM (`backend/app/services/llm/`)

### 4.1 `provider.py` — Protocol (26 líneas)

```python
class LLMProvider(Protocol):
    async def generate_stream(
        self, messages: list[dict], system_prompt: str,
        config: dict | None = None, usage_sink: dict | None = None,
    ) -> AsyncGenerator[str, None]: ...
```

Contrato sobre `usage_sink`: el adapter MUST poblar `prompt_tokens` y `completion_tokens` cuando estén disponibles (best-effort; no raise si el provider no expone usage).

### 4.2 `__init__.py` — Factory (33 líneas)

`get_llm_provider() -> LLMProvider` — lee `settings.LLM_PROVIDER`:
- `"gemini_native"` → `GeminiAdapter` (fallback legacy)
- default `"openai_compat"` → `OpenAICompatAdapter`

Función (no singleton) porque cada request construye su propio adapter — matches `session_router._get_chat_service`.

### 4.3 `openai_adapter.OpenAICompatAdapter` (201 líneas)

**Funciona contra cualquier endpoint OpenAI-compat**: Gemini OpenAI-compat, OpenAI, Mabel-Gemma4 (Modal serverless), vLLM/Ollama, OpenRouter. Switching de provider sólo cambia 3 env vars.

**Constantes**:
- `COLD_START_MAX_RETRIES = 8`, `COLD_START_BACKOFF_SECONDS = 10` (Modal cold start tarda 60-90s).
- `TRANSIENT_MAX_RETRIES = 3`, `TRANSIENT_BASE_BACKOFF_SECONDS = 1.0` (compensa `max_retries=0` del SDK).

**Constructor**: `AsyncOpenAI(api_key=settings.effective_llm_api_key, base_url=settings.LLM_BASE_URL, timeout=settings.LLM_TIMEOUT_MS/1000, max_retries=0)`.

**`generate_stream`**:
- Antepone `{"role": "system", "content": system_prompt}` si no vacío.
- Setea `stream_options={"include_usage": True}` — sin esto, streaming responses NUNCA exponen token counts.
- Maneja terminal usage chunk antes del `if not chunk.choices: continue` early-skip (sin esto, el último chunk con choices vacío descartaba el usage).
- Mapea `temperature` y `max_output_tokens` → `max_tokens` (alias OpenAI).
- Wrappea cualquier excepción upstream como `ValueError(f"LLM_ERROR: {e}")`.

**Retry policies** (`_create_with_cold_start_retry`, `_try_create_with_transient_retry`):
1. **Cold start (503 con body 'loading model')**: 8×10s = 80s. Detector estricto por substring `"loading model"` (antes `'loading' OR 'model'` bloqueaba 80s ante errores permanentes — audit 2026-05-23).
2. **Transient (429/502/504)**: backoff exponencial 1s, 2s, 4s (3 intentos).
3. Otros → bubble inmediato tras 1 intento.

### 4.4 `gemini_adapter.GeminiAdapter` (76 líneas — legacy fallback)

**Constructor**: `genai.configure(api_key=settings.GEMINI_API_KEY)`. `system_instruction` se bindea por-call (no por-construct).

**`generate_stream`**: Construye `GenerativeModel(model_name, system_instruction=system_prompt or None)` fresh por request. **Crítico**: el comentario nota que omitir `system_instruction` silently DROPPEA el system prompt (rompe la identity guardrail — el modelo podría revelar "Soy Gemini"). Mapea Gemini's `usage_metadata` (`prompt_token_count`, `candidates_token_count`) al `usage_sink`. Overwrites en cada chunk porque Gemini emite cumulative (no delta). Wrappea como `ValueError(f"LLM_ERROR: {e}")`.

### 4.5 `prompts.py` (313 líneas)

**Dos system prompts** soportados:

1. **`MABEL_GEMMA4_SYSTEM_PROMPT`** (~16 líneas literal) — Prompt B+ EXACTO con el que se fine-tuneó `mabel-gemma4-e4b-Q4_K_M`. Cambiarlo degrada calidad (safety guardrails debilitan, deja de ser conversacional, puede diagnosticar). Documenta riesgo residual: si Modal serve el modelo BASE por error de deploy, brand leak posible — mitigación operativa (`/api/v1/llm/health` para pre-warming + smoke chat).
2. **`MABEL_SYSTEM_PROMPT`** (~25 líneas) — Versión rica con identidad, personalidad, límites, para LLMs no entrenados.

**Detector**:
- `is_mabel_gemma4() -> bool` — `settings.LLM_FLAVOR == "mabel_gemma4"`. **Decisión explícita** desde 2026-05-23: antes inferia por substring match en `LLM_MODEL` (frágil: rename a `'umb-gemma4-prod'` → False cuando debía ser True; coincidencia tipo `'mabel-gemma3-otro'` → True cuando debía ser False).

**Builders**:
- `build_checkin_context_block(checkin_payload) -> str` — Serializa los 7 campos del check-in: `mood (0-10)`, `energy (1-4)`, `stress (1-4)`, `sleep_quality (str)`, `sleep (float opcional)`, `loneliness (1-4)`, `focus (str|list)`, `focus_other (str)`, `note (str)`. Returns "" si payload vacío. Usado por: (a) `_build_system_prompt_generic` (concat al system para Gemini/OpenAI), (b) `chat_service` directo para inyectar como prefijo al primer user turn cuando es Mabel-Gemma4.
- `build_system_prompt(checkin_payload) -> str` — Si `is_mabel_gemma4()` → prompt fijo sin modificar. Else → `_build_system_prompt_generic` con check-in inline.
- `_build_system_prompt_generic(checkin_payload)` — Concat de `MABEL_SYSTEM_PROMPT` + bloque "CONTEXTO DEL ESTUDIANTE" + instrucción explícita ("no repitas textual, demuestra empatía", "si ánimo bajo + sin batería → valida descanso, no propongas ejercicios activos").
- `_format_focus(focus, focus_other)` — Soporta string (legacy) o list, concatena `(otro: "...")` si list incluye `"Otro"`.

**Diccionarios de label**: `_SLEEP_QUALITY_LABEL`, `_ENERGY_LABEL`, `_STRESS_LABEL`, `_LONELINESS_LABEL` — mapean valores numéricos/strings a descripciones humanas que el LLM puede empatizar mejor.

---

## 5. Repositories (`backend/app/repositories/`)

Tabla compacta de los **14** repos. Patrón D-12 aplicado en TODOS excepto los marcados con (commit).

| Archivo | Tabla | Métodos públicos | Notas |
|---|---|---|---|
| `attachment_repository.py` | `attachments` | `create(message_id, kind, path, meta)` | Solo INSERT. No usado activamente (Fase 7 voice). |
| `audit_log_repository.py` | `audit_logs` | `create(actor_id, action, actor_role="admin", target_type, target_id, details, ip)`, `list_with_filters(...)` | Default `actor_role="admin"` aún presente aquí (el wrapper `audit_log_action` en `audit_service.py` lo fuerza kwargs-only sin default — capa correcta del gate). |
| `consent_repository.py` | `consents` | `get_by_user_and_version`, `get_latest_by_user`, `create`, `update` | D-12: `create` y `update` solo flushean. |
| `consent_version_repository.py` | `consent_versions` | `get_active`, `get_by_id`, `list_all` | Read-only; el lifecycle lo orquesta `AdminConfigService`. |
| `empathy_rating_repository.py` | `empathy_ratings` | `create`, `list_unrated_messages`, `count_unrated_messages`, `list_by_filters`, `get_by_id`, `stats(eligible_user_ids, cohort)` | `eligible_user_ids` es **kwarg requerido** (fail-secure) en queue/stats — un default `=[]` reintroduciría el bug de "mostrar todos". `create` mapea `IntegrityError` → `ValueError("ALREADY_RATED")` (con `db.rollback()` interno — necesario para que la session quede usable y el caller pueda mapear a 409). |
| `message_report_repository.py` | `message_reports` | `create`, `check_exists`, `get_by_id`, `list_with_filters`, `update_status` | `update_status` setea `updated_at=now()` (actúa como `triaged_at` aproximado — la columna no existe) y appendea `[timestamp] status: notes` a `details` (el split lo hace `reports_service._split_details`). |
| `message_repository.py` | `messages` | `create`, `list_by_session`, `get_by_id`, `get_recent_context(limit)`, `find_greeting` | `get_recent_context` hace `ORDER BY DESC LIMIT n` y luego `reverse()` en Python (más barato que window function para context windows pequeños). `find_greeting` usa el partial UNIQUE INDEX `uq_messages_session_greeting` (consulta por `meta->>'greeting' = 'true'`). |
| `password_reset_repository.py` (commit) | `password_reset_tokens` | `create`, `get_by_token_hash`, `mark_used` | Sí commitea internamente (el flow de password reset es side-effect-y y no se bundlea con audit en la misma transacción). |
| `preference_repository.py` (commit) | `preferences` | `get_by_user_id`, `create`, `update` | Commitea internamente — no hay audit asociado al toggle de prefs. |
| `safety_event_repository.py` | `safety_events` | `create`, `get_by_id`, `list_with_filters`, `update_status` | `update_status` appendea entries a `payload.admin_notes` (necesita `flag_modified(event, 'payload')` para que SQLAlchemy detecte la mutación in-place sobre JSONB). |
| `session_repository.py` | `sessions` | `create`, `get_by_id(include_hidden=False)`, `list_by_user`, `update`, `close_active(user_id)` | `get_by_id` filtra `hidden_at IS NULL` por default — solo `HistoryService` pasa `include_hidden=True` (necesario para des-ocultar o hard-delete). `list_by_user` usa el índice parcial `idx_sessions_user_visible`. |
| `survey_response_repository.py` | `survey_responses` | `list_by_filters`, `get_sus_scores`, `get_empathy_scores`, `get_wellbeing_pairs` | Solo read. Métricas de tesis (SUS Brooke, empathy rubric, pre-post wellbeing). Wellbeing pairing por user_id, skip si falta `wellbeing_pre` o `wellbeing_post`. |
| `system_config_repository.py` | `system_config` | `get_value`, `get_safety_keywords` (normaliza shape legacy `list[str]` → `[{keyword, critical:false}]`), `get_sos_threshold` (default 3), `get_guardrails_enabled` (default True), `get_sos_hotline_numbers`, `list_all`, `get_row`, `update_value`, `invalidate()` | **Cache por instancia** (`_cache: dict | None`) — invalidado por `update_value` y método público `invalidate()` (callers que UPSERTean fuera de `update_value` —`AdminConfigService._persist_last_test`— deben llamar `invalidate()` para no leer stale). |
| `user_repository.py` (commit en algunos) | `users` | `get_by_id`, `get_by_email`, `create` (flush), `update_password` (commit), `delete` (commit) | `create` D-12: solo flushea (caller `AuthService.register` commitea con audit). `update_password` y `delete` aún commitean internamente — pre-D-12 hold-overs; `update_password` sólo se llama desde flows que no bundlean audit; `delete` se llama desde `AccountService.delete_account` que ya escribió el audit y se beneficia del commit interno. |

---

## 6. Middleware (`backend/app/middleware/`)

### `auth.py` (97 líneas)

**Dependencias FastAPI** inyectables via `Depends`:

- `get_current_user(credentials = Depends(bearer_scheme), db = Depends(get_db)) -> User` — Valida JWT (`jwt.decode` con `HS256` + `settings.JWT_SECRET`). Mapea: ausencia → 401 "No autenticado", `ExpiredSignatureError` → 401 "Token expirado", cualquier otro `InvalidTokenError` → 401 "Token invalido". Lee `users` por `payload.sub`. Rechaza `deleted_at != NULL` (401) Y `disabled_at != NULL` (403 "Cuenta deshabilitada" — gate en middleware porque no hay revocación de tokens en MVP; sin esto un disabled seguiría consumiendo recursos hasta expirar su token).
- `require_role(role: str) -> Callable` — Factory de dependencia que verifica `current_user.role == role` (403 si no).
- `require_admin = require_role("admin")` — Instancia singleton para rutas admin.
- `require_consent(current_user, db) -> User` — Short-circuit `if current_user.role == "admin": return current_user`. Else instancia `ConsentService(consent_repo, version_repo, db=db)` y verifica `status == "ok"` (sin esto: 403 con detail `{message, consent_status}`).

**Uso** (en routers):
```python
@router.get("/sessions")
async def list_sessions(user: User = Depends(require_consent), ...):
    ...
```

---

## 7. Core (`backend/app/core/`)

### `config.py` (87 líneas)

**`Settings(BaseSettings)`** (Pydantic): lee `.env` desde la raíz del repo (`Path(__file__).parents[3] / '.env'`).

Variables:

| Nombre | Default | Propósito |
|---|---|---|
| `DATABASE_URL` | (required) | Postgres async. Coerced a `postgresql+asyncpg://` por `_coerce_async_pg_url` (Railway inyecta `postgres://`). |
| `JWT_SECRET` | `""` | Secret HS256. **Default vacío deliberado**: procesos auxiliares (cron de retención, scripts) importan `settings` sin necesitar JWT. El web service lo valida en su `lifespan` (`app.main`) y aborta boot si está vacío. |
| `LLM_PROVIDER` | `"openai_compat"` | `"openai_compat"` (default, soporta Gemini OpenAI-compat / OpenAI / vLLM / Ollama / Mabel-Gemma4 / OpenRouter) o `"gemini_native"` (SDK Google legacy). |
| `LLM_FLAVOR` | `"generic"` | `"mabel_gemma4"` → usa `MABEL_GEMMA4_SYSTEM_PROMPT` (fine-tune) + inyecta check-in al user turn. `"generic"` → `MABEL_SYSTEM_PROMPT` con check-in inline. Decisión explícita (no inferencia por substring de model name — frágil). |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` | Endpoint OpenAI-compat. |
| `LLM_API_KEY` | `""` | Key para `OpenAICompatAdapter`. |
| `LLM_MODEL` | `"gemini-2.5-flash"` | Model id. |
| `LLM_TIMEOUT_MS` | `30000` | Timeout HTTP del cliente OpenAI. |
| `GEMINI_API_KEY` | `""` | Legacy. Usado como fallback por `effective_llm_api_key`. |
| `GEMINI_MODEL` | `"gemini-2.5-flash"` | Para `GeminiAdapter` legacy. |
| `GEMINI_TIMEOUT_MS` | `30000` | Para `GeminiAdapter`. |
| `CORS_ORIGINS` | `"http://localhost:5173"` | Comma-separated. Property `cors_origins_list` lo splittea. |
| `CONTEXT_WINDOW_SIZE` | `20` | Mensajes incluidos en el contexto LLM. |
| `WHISPER_MODEL` | `"base"` | Modelo faster-whisper. |
| `PIPER_VOICE` | `"es_ES-mls_9972-low"` | Voz Piper. |
| `PIPER_MODEL_PATH` | `"models/piper/"` | Directorio con `.onnx` + `.onnx.json`. |
| `UPLOAD_DIR` | `"uploads/audio/"` | Para ASR file uploads. |

**Properties**:
- `cors_origins_list` — `[o.strip() for o in CORS_ORIGINS.split(",")]`.
- `effective_llm_api_key` — `LLM_API_KEY or GEMINI_API_KEY or ""`. **Existe para back-compat**: `.env` legacy solo definía `GEMINI_API_KEY`; sin este fallback, pull del branch nuevo sin actualizar `.env` bootea `AsyncOpenAI(api_key='')` y todo chat falla con 401. Consumers DEBEN leer esta property, NUNCA `LLM_API_KEY` directo.

**`_coerce_async_pg_url(url)`** — Railway inyecta `postgres://` o `postgresql://`; SQLAlchemy + asyncpg necesitan el driver explícito `postgresql+asyncpg://`. Sin esta coerción el engine bootea con psycopg2 sync y las sesiones async fallan al arranque.

### `database.py` (14 líneas)

```python
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
```

`expire_on_commit=False` para que los modelos ORM sigan siendo usables tras commit (necesario para serializar a Pydantic en routers).

---

## 8. Main (`backend/app/main.py`)

### Lifespan hook (lines 36-59)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.JWT_SECRET:
        raise RuntimeError("JWT_SECRET no está configurado...")
    mark_process_started()
    yield
```

Razones documentadas:
- Validación de `JWT_SECRET` aquí (no en `config.py`): procesos auxiliares deben importar `settings` sin requerir JWT, pero el web service NO puede bootear sin él.
- `mark_process_started()` (de `admin/config_service`) pinea `_PROCESS_START_TS` aquí (no import time — re-imports en tests/tooling lo reseteaban; F7).

### CORS

```python
app.add_middleware(CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"])
```

### Routers registrados (19 total, todos bajo `/api/v1`)

**Públicos/student** (12): `asr`, `auth`, `consent`, `users`, `preference`, `session`, `report`, `safety_event`, `system_config`, `tts`, `data_control`, `llm_health`.

**Admin** (7, agrupados al final): `admin_users`, `admin_reports`, `admin_safety_events`, `admin_metrics`, `admin_config`, `admin_audit_logs`, `admin_empathy_ratings`.

### Health

`GET /api/v1/health → {"status": "ok", "version": "0.1.0"}`.

### SPA serving (lines 100-145)

Sirve `backend/static/` cuando existe (build de Vite en Railway). Path-traversal guard:
```python
candidate = (_FRONTEND_DIR / full_path).resolve()
try:
    candidate.relative_to(_FRONTEND_DIR)
except ValueError:
    return FileResponse(_INDEX_FILE)  # cae al SPA sin filtrar el filtro
```

Sin esta validación, `GET /../config.py` permitiría leer cualquier archivo del container.

- `/api/*` → 404 (no se sirve SPA en rutas API).
- Sin `full_path` → `index.html`.
- Archivo existente → servir.
- `../` o no existe → fallback a `index.html` (React Router lo maneja).

---

## 9. Patrones cross-cutting

### Transacciones (D-12)

- **Patrón estándar**: repo solo `flush()`, service ejecuta `audit_log_action(db, ...)` (también solo flushea), service hace `await db.commit()` único.
- **Excepciones documentadas** (commits en repo):
  - `UserRepository.update_password` / `.delete` — pre-D-12; safe porque los callers (`AccountService`) escriben el audit ANTES y dependen del commit interno de `delete`.
  - `PasswordResetRepository.create` / `.mark_used` — Flow standalone sin audit bundling.
  - `PreferenceRepository.create` / `.update` — Sin audit log asociado al toggle de prefs.
  - `SafetyEventRepository.create` es llamado desde `GuardrailsService.pre_filter` / `post_filter` que commitean inmediatamente — el "audit" es el safety_event mismo, no hay row de `audit_logs` que bundlear.
- **SAVEPOINT** (`begin_nested`): único uso documentado en `AdminConfigService._persist_last_test` — aísla un INSERT/UPSERT flaky de telemetry para no poison la transacción del audit log de la operación principal.

### Async end-to-end

Todo el stack es async desde el router hasta la DB. `AsrService.transcribe` es síncrono por limitación de faster-whisper, pero se llama dentro de handlers async (en producción merece un `run_in_threadpool` para no bloquear el event loop — pendiente).

### Error handling

- **Business errors**: `raise ValueError("CODE")` o `ValueError("CODE: detail")` en services. Routers mapean a `HTTPException(status_code=...)` con códigos específicos.
- **Códigos canónicos** observados: `INVALID_CONFIRMATION`, `USER_NOT_FOUND`, `WRONG_PASSWORD`, `SAME_PASSWORD`, `DUPLICATE_EMAIL`, `INVALID_CREDENTIALS`, `DISABLED:{reason}`, `INVALID_TOKEN`, `EXPIRED_TOKEN`, `SESSION_NOT_FOUND`, `ACCESS_DENIED`, `SESSION_ENDED`, `CHECKIN_ALREADY_COMPLETED`, `INVALID_VERSION`, `DUPLICATE_CONSENT`, `NO_ACTIVE_VERSION`, `NO_CONSENT_FOR_VERSION`, `ALREADY_ACTIVE`, `ALREADY_REVOKED`, `SCOPE_REQUIRED`, `CONSENT_REVOKED`, `ALREADY_SOLO_USO`, `UNSUPPORTED_ACTION`, `MESSAGE_NOT_FOUND`, `CANNOT_REPORT_OWN_MESSAGE`, `DUPLICATE_REPORT`, `INVALID_VALUE: ...`, `KEY_NOT_FOUND`, `VERSION_NOT_FOUND`, `NOT_DRAFT`, `HAS_REFERENCES`, `INVALID_TRANSITION`, `REPORT_NOT_FOUND`, `SAFETY_EVENT_NOT_FOUND`, `INVALID_SCORE`, `ALREADY_RATED`, `RATING_NOT_FOUND`, `FORBIDDEN`, `CANNOT_DISABLE_ADMIN`, `ALREADY_DISABLED`, `ALREADY_ENABLED`, `CANNOT_DELETE_ADMIN`, `USER_NOT_DISABLED`.
- **LLM errors**: `OpenAICompatAdapter` y `GeminiAdapter` wrapean todo upstream como `ValueError(f"LLM_ERROR: {e}")`; `ChatService.send_message` los re-clasifica a mensajes user-friendly por substring (429/401/timeout/cold start/model not found/network).

### Logging

- `logging.getLogger(__name__).exception(...)` en `ChatService` (LLM failures) y `AdminConfigService` (telemetry write failures).
- `print()` ocasional en boot scripts.
- **No hay `structlog`** instalado — opportunity para Fase 10.

### Audit emission

- Wrapper único: `await audit_log_action(db, actor_id=..., actor_role=..., action=..., target_type=..., target_id=..., details=..., ip=...)`.
- Whitelist `ALLOWED_ACTIONS` en `audit_service.py` documenta vocabulario (no es enforcement — el CHECK constraint Postgres es).
- IP se captura en el router via `request.client.host` y se pasa down.

---

## 10. Drift / pendientes detectados

1. **`AuditLogRepository.create` aún tiene default `actor_role="admin"`** (línea 18). El wrapper `audit_service.audit_log_action` lo fuerza kwargs-only sin default, así que no hay riesgo en práctica — pero el doble contrato es confuso. Recomendación: alinear el repo a kwargs-only sin default.
2. **`AsrService.transcribe` es síncrono** dentro de handlers async — bloquea el event loop bajo carga. Wrappear con `fastapi.concurrency.run_in_threadpool` o equivalente.
3. **`AdminUsersService.list_users` slow path** (filtro `consent_status`): TODO documentado in-code — pilot scale (30 users) es aceptable, pero requiere `DISTINCT ON (user_id) ... ORDER BY user_id, accepted_at DESC` para producción.
4. **`PreferenceRepository`, `PasswordResetRepository`, `UserRepository.update_password/.delete` aún commitean internamente** — pre-D-12 hold-overs. Safe hoy porque sus callers no bundlean audit, pero rompen el patrón uniforme y harían fácil que un futuro caller los rompa por accidente. Migrar a flush-only y empujar el commit al service caller correspondiente.
5. **`GeminiAdapter` legacy mantenido** — usable vía `LLM_PROVIDER=gemini_native`. Decidir si retirar tras migración completa a OpenAI-compat.
6. **No hay rate limiting** en ningún middleware. El cold-start retry de Modal puede gastar 80s por request — un cliente malicioso puede correr esto en paralelo. Pendiente para hardening pre-deploy.

---

## 11. Referencias cruzadas

- Schema BD: `docs/DB_SCHEMA.md` + `db/schema_postgresql.sql`.
- API endpoints: `docs/API_REFERENCE.md`.
- Admin panel: `docs/ADMIN_PANEL.md`.
- Data retention: `docs/DATA_RETENTION_POLICY.md` (HistoryService).
- LLM migration: memory `llm-openai-compat-migration.md`.
- Decisiones rectoras (D-03/04/05/06/07/08/11/12/14/15): `openspec/specs/admin-*` + memory `discrepancy-decisions.md`.
