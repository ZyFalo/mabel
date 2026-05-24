# Stack Tecnológico — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `4d124e2`
> **Fuente de verdad**: este archivo + `Dockerfile` + `backend/requirements.txt` + `frontend/package.json`
> **Reemplaza**: `TECHSTACK.md` (raíz, deprecated) y Notion "Tech Stack Definitivo — Mabel IA (MVP)" (obsoleta desde 2026-03-01, última revisión #4 — 2026-02-24)

---

## 1. Resumen ejecutivo

Mabel IA es un asistente virtual de psicoeducación en salud mental para estudiantes de la Universidad Manuela Beltrán (Bogotá, Colombia). El stack ha evolucionado desde el planteamiento original "100% local + Gemini directo" hacia una **arquitectura híbrida cloud**:

- **Web service** (FastAPI + SPA empaquetada en un único container) desplegado en **Railway**.
- **Servicio cron** independiente en Railway (`railway.cron.toml`) para retención de datos (L2 redaction).
- **LLM serverless** (Mabel-Gemma4-E4B fine-tuneado) en **Modal.com**, expuesto vía OpenAI-compat. Scale-to-zero con cold start 60–90 s mitigado por UX en 3 capas.
- **PostgreSQL 16** (Docker local en `:5433`, Railway Managed Postgres en prod).
- **Voz**: faster-whisper (ASR) + Piper (TTS) ejecutados en el mismo container del web service. La voz de español Piper se baked en la imagen Docker (~60 MB en build).

El stack sigue mantenido por 3 estudiantes y cumple Ley 1581/2012 (datos sensibles), Ley 1616/2013 (salud mental), Resolución 8430/1993 (investigación). El adapter pattern (`LLMProvider`) permite swap entre proveedores cambiando solo 3 env vars; no se reestructura código.

Lo único que sobrevive intacto del plan original: PostgreSQL como motor único, FastAPI + Pydantic + SQLAlchemy 2.0 async, React SPA, JWT stateless con PyJWT, guardrails custom Python, hard DELETE con CASCADE.

---

## 2. Backend

Runtime y framework

| Componente | Versión (real) | Origen | Notas |
|---|---|---|---|
| Python | **3.11-slim** | `Dockerfile:28` | Runtime de producción. Antes se documentó 3.12; la imagen final corre 3.11 (estabilidad de wheels en faster-whisper). |
| FastAPI | `>=0.115,<1` | `backend/requirements.txt:1` | ASGI app principal. Lifespan hook valida `JWT_SECRET` no vacío al boot (`app/main.py:52-58`). |
| Uvicorn (`[standard]`) | `>=0.32,<1` | `requirements.txt:2` | Servidor ASGI; `exec uvicorn ...` como PID 1 en Docker para SIGTERM graceful (`Dockerfile:82-87`). |
| Pydantic Settings | `>=2.6,<3` | `requirements.txt:6` | Carga de `.env` desde la raíz del repo (`app/core/config.py:6`). |
| SQLAlchemy `[asyncio]` | `>=2.0,<3` | `requirements.txt:3` | ORM async. Repository pattern. |
| asyncpg | `>=0.30,<1` | `requirements.txt:4` | Driver async para Postgres. URL se coerce a `postgresql+asyncpg://` (`config.py:73-83`). |
| Alembic | `>=1.14,<2` | `requirements.txt:5` | Migraciones. Boot del container corre `alembic upgrade head` antes de uvicorn (`Dockerfile:85`). 10 archivos en `backend/alembic/versions/` al 2026-05-24 (1 initial + 2 seeds + 7 evolutivas 006-012). |

Auth y seguridad

| Componente | Versión | Notas |
|---|---|---|
| PyJWT | `>=2.9,<3` | Firma HS256 stateless. Sustituye a python-jose (discontinuado). |
| bcrypt | `>=4.2,<5` | Hashing directo (no via passlib). |
| python-multipart | `>=0.0.20,<1` | Upload de audio (ASR). |

LLM / dependencias auxiliares

| Componente | Versión | Notas |
|---|---|---|
| openai | `>=1.50,<2` | Cliente del adapter por defecto (`OpenAICompatAdapter`). |
| google-generativeai | `>=0.8,<1` | Solo para `GeminiAdapter` legacy (fallback cuando `LLM_PROVIDER=gemini_native`). |
| faster-whisper | `>=1.0,<2` | ASR local. |
| piper-tts | `>=1.4,<2` | TTS local subprocess. |
| scipy | `>=1.13,<2` | Estadística inferencial del panel admin: `ttest_rel`, `wilcoxon`, `shapiro`, `t.ppf` para IC, además de Cohen's d. Importado en `backend/app/services/admin/metrics_service.py:27`. **Carga `numpy` transitivamente** (numpy NO está declarado en `requirements.txt`; si scipy cambia su dep tree, el panel rompe — ver DR-13 en `AGENTES.md` §10). |
| python-dotenv | `>=1.0,<2` | Carga `.env` (en local; Railway inyecta directo). |
| Ruff | `>=0.8,<1` | Linter + formatter Python. |

Capas (`backend/app/`)

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| routers | `routers/` (+ `routers/admin/`) | Endpoints FastAPI. 19 routers registrados en `main.py` (12 estudiante/sistema + 7 admin: users, reports, safety-events, metrics, config, audit-logs, empathy-ratings). |
| services | `services/` | Lógica de negocio (`chat_service`, `auth_service`, `guardrails_service`, `consent_service`, `asr_service`, `tts_service`, `admin/*`). |
| services/llm | `services/llm/` | `provider.py` (Protocol), `openai_adapter.py`, `gemini_adapter.py`, `prompts.py`, `__init__.py` (factory `get_llm_provider`). |
| repositories | `repositories/` | Data access (uno por tabla activa). |
| models | `models/` | 15 modelos SQLAlchemy ORM (`attachment`, `audit_log`, `consent`, `consent_version`, `empathy_rating`, `message`, `message_report`, `password_reset_token`, `preference`, `safety_event`, `session`, `session_rating`, `survey_response`, `system_config`, `user`) + `__init__.py` y `base.py` (=17 archivos en total). |
| schemas | `schemas/` | DTOs Pydantic request/response. |
| middleware | `middleware/auth.py` | JWT auth + `require_auth`, `require_consent`, `require_admin`. |
| core | `core/config.py`, `core/database.py` | Settings tipadas + engine async. |

---

## 3. Frontend

Versiones reales según `frontend/package.json` (al 2026-05-24):

| Paquete | Versión | Uso |
|---|---|---|
| react / react-dom | `^19.2.0` | SPA. React 19 (no 18 como decía Notion). |
| react-router-dom | `^7.13.1` | Routing (v7, no v6). |
| vite | `^7.3.1` | Bundler dev/build. |
| `@vitejs/plugin-react` | `^5.1.1` | HMR + Fast Refresh. |
| tailwindcss | `^4.2.1` | CSS utility-first (v4, no v3.4). |
| `@tailwindcss/vite` | `^4.2.1` | Plugin Vite v4 (config en `vite.config.ts`, sin `tailwind.config.js` separado). |
| zustand | `^5.0.11` | Stores globales en `frontend/src/stores/`: `authStore`, `chatStore`, `preferencesStore`, `toastStore`, `adminStore`. |
| axios | `^1.13.6` | Cliente HTTP. Interceptor JWT en `src/api/client.ts`. |
| recharts | `^3.8.1` | Gráficos del panel admin (métricas B–E). |
| lucide-react | `^1.16.0` | Iconografía. |
| TypeScript | `^5.9.3` | Tipado del frontend. |
| eslint | `^9.39.1` | Linter (flat config). |
| prettier | `^3.8.1` | Formatter. |

Páginas (`frontend/src/pages/`) — **17 archivos student** (`Landing`, `Login`, `Register`, `ForgotPassword`, `ResetPassword`, `Consent`, `ConsentRejected`, `ConsentRequired`, `Onboarding`, `Home`, `CheckIn`, `Chat`, `Voice`, `SessionDetail`, `SessionEnd`, `Settings`, `AccessDenied`) + subdirectorio `admin/` con **9 páginas** (`Dashboard`, `Users`, `UserDetail`, `Reports`, `SafetyEvents`, `Metrics`, `Config`, `AuditLogs`, `EmpathyRatings`).

Hooks personalizados (`frontend/src/hooks/`) — **6 hooks**: `useAudioRecorder` (MediaRecorder API), `useElapsedSeconds` (contador con gracia 600ms para Strict Mode + SSE blip), `useKeyboardShortcuts` (cmd-k, etc.), `useLlmPrewarm` (poll `/api/v1/llm/health` con Page Visibility guard), `useSubtitles` (highlight word-by-word proporcional), `useTts` (auto-play + mute global vía localStorage).

Stores Zustand (`frontend/src/stores/`) — **5 stores**: `authStore`, `chatStore`, `preferencesStore`, `toastStore`, `adminStore`.

Guards (`frontend/src/guards/`) — 5 guards: `ProtectedRoute`, `ConsentGuard`, `OnboardingGuard`, `PublicRoute`, `RoleGuard`.

PWA: NO activa al 2026-05-24 (D-15 en backlog; `vite-plugin-pwa` no instalado).

> El frontend se compila en Stage 1 del Dockerfile y se copia a `/app/static` en Stage 2. El SPA se sirve desde el mismo FastAPI con catch-all en `app/main.py:121-145`, con guard de path-traversal.

---

## 4. Base de datos

| Componente | Detalle |
|---|---|
| Motor | PostgreSQL 16 (único, dev y prod). |
| Local | `docker compose up -d` levanta el servicio en `localhost:5433`. |
| Prod | Railway Managed Postgres; `DATABASE_URL` inyectado por el plugin. Se normaliza a `postgresql+asyncpg://` en `config.py:73-83`. |
| Extensión | `pgcrypto` (UUIDs `gen_random_uuid()`). |
| Migraciones | Alembic. **10 archivos** en `backend/alembic/versions/` al 2026-05-24 (`08b6189ffc35_initial_schema_13_tables` → `012_sessions_hidden`): 1 initial + 2 seeds + 7 evolutivas (006-012). Detalle: `docs/DB_SCHEMA.md` §4 y `docs/AGENTES.md` §9.4. |
| DDL fuente | `db/schema_postgresql.sql` para referencia humana; los models SQLAlchemy son la fuente real al haber Alembic autogenerate. |

Detalle de tablas, columnas, FK, índices y evoluciones completas (002 → 012): ver `docs/DB_SCHEMA.md`. Política de retención: `docs/DATA_RETENTION_POLICY.md`.

---

## 5. LLM — la pieza más cambiada

### 5.1 Adapter pattern

`backend/app/services/llm/provider.py` define:

```python
class LLMProvider(Protocol):
    async def generate_stream(
        self,
        messages: list[dict],
        system_prompt: str,
        config: dict | None = None,
        usage_sink: dict | None = None,
    ) -> AsyncGenerator[str, None]: ...
```

**Contrato semántico de `usage_sink`** (load-bearing): si el caller pasa un dict, el adapter DEBE rellenarlo in-place con `prompt_tokens` y `completion_tokens` (típicamente en el último chunk del stream). Esa mutación alimenta las columnas `messages.tokens_prompt` y `messages.tokens_completion` en BD. Adapters deben tratar `usage_sink` como **best-effort** y nunca lanzar excepción si el proveedor no expone usage. Callers que no necesitan stats lo omiten.

Factory en `services/llm/__init__.py`:

```python
def get_llm_provider() -> LLMProvider:
    provider = (settings.LLM_PROVIDER or "openai_compat").lower()
    if provider == "gemini_native":
        from app.services.llm.gemini_adapter import GeminiAdapter  # lazy
        return GeminiAdapter()        # legacy fallback
    from app.services.llm.openai_adapter import OpenAICompatAdapter  # lazy
    return OpenAICompatAdapter()      # default
```

> **Imports lazy intencionales** dentro de las ramas del `if`. Esto evita cargar el SDK `google-generativeai` cuando el provider activo es `openai_compat`, y viceversa — reduce el peso al startup y permite que el cron service (que no usa LLM) no arrastre ninguno de los dos.

Dos implementaciones activas:

- **`OpenAICompatAdapter`** (`openai_adapter.py`) — default. Cualquier proveedor que exponga `/v1/chat/completions`: OpenAI, Gemini OpenAI-compat, Modal.com, vLLM/Ollama, OpenRouter, etc. Cambiar de proveedor: solo tocar `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Cero cambios de código.
- **`GeminiAdapter`** (`gemini_adapter.py`) — fallback legacy con SDK nativo `google-generativeai`. Se mantiene por features que el endpoint OpenAI-compat no expone.

### 5.2 Mabel-Gemma4-E4B (modelo de producción)

- Fine-tune sobre Gemma 4 E4B.
- Cuantización GGUF Q4_K_M (~3.5 GB de pesos).
- Hosting: **Modal.com**, NVIDIA T4 16 GB, scale-to-zero **5 min idle**.
- Cold start: **60–90 s** (carga del modelo + warm-up). Documentado en `openai_adapter.py:18-22` y `useLlmPrewarm.ts:4-7`.
- Repo separado: [`github.com/ZyFalo/Gemma4-Mabel`](https://github.com/ZyFalo/Gemma4-Mabel) (fuera de este monorepo). Para detalles de training/eval/hosting Modal ver `docs/MODEL_TRAINING.md` (índice navegable a los 23 docs del otro repo).
- Identidad por entrenamiento: el modelo NO necesita instrucciones de "no digas Gemini/Google" en el system prompt.

### 5.3 Selección de prompt — `LLM_FLAVOR`

`prompts.py` mantiene dos system prompts:

- **`MABEL_GEMMA4_SYSTEM_PROMPT`** (`prompts.py:46-62`) — prompt B+ EXACTO con el que se fine-tuneó. NUNCA editar a la ligera (degrada safety, estilo y guardrails según la doc del repo `Gemma4-Mabel`).
- **`MABEL_SYSTEM_PROMPT`** (`prompts.py:84-109`) — prompt rico para LLMs no entrenados (Gemini, OpenAI). Incluye identidad, personalidad, límites.

La selección la decide `is_mabel_gemma4()` (`prompts.py:64-82`) leyendo `settings.LLM_FLAVOR`:

- `LLM_FLAVOR=mabel_gemma4` → devuelve el prompt fijo del fine-tune **sin** inyectar check-in al system.
- `LLM_FLAVOR=generic` (default) → devuelve `MABEL_SYSTEM_PROMPT` con check-in concatenado.

> **Audit 2026-05-23**: la selección antes se inferia por substring match en `LLM_MODEL` (`"mabel-gemma" in model`). Se cambió a env var explícita por bugs: rename a `umb-gemma4-prod` daba False cuando debía ser True; modelos `mabel-gemma3-otro-proyecto` daban True cuando debían ser False.

### 5.4 Check-in: inyección al user turn (no system) cuando `LLM_FLAVOR=mabel_gemma4`

`build_checkin_context_block(checkin_payload)` (`prompts.py:159-211`) serializa los 7 campos del check-in actual:

- `mood` (0–10), `energy` (1–4), `stress` (1–4), `sleep_quality` (str), `sleep` (float opcional), `loneliness` (1–4), `focus` (str|list), `focus_other` (str), `note` (str).

Dos escenarios de uso:

1. `LLM_FLAVOR=generic` → se concatena al `MABEL_SYSTEM_PROMPT` (lo hace `build_system_prompt()` internamente).
2. `LLM_FLAVOR=mabel_gemma4` → `chat_service.send_message` lo prefija al **primer turno del usuario**. El system prompt del fine-tune queda intacto.

### 5.5 Cold-start retry y transient retry

`openai_adapter.py` configura el SDK con `max_retries=0` y maneja dos políticas distintas (`_create_with_cold_start_retry`, `_try_create_with_transient_retry`):

| Patrón | Trigger | Política |
|---|---|---|
| Cold start Modal | HTTP 503 con body conteniendo `loading model` (case-insensitive) | 8 intentos × 10 s = hasta **80 s**. |
| Transient | HTTP 429 (rate limit), 502 (bad gateway), 504 (timeout) | Backoff exponencial 1 s → 2 s → 4 s, máx 3 intentos. |
| Otros 4xx/5xx | Cualquier otro código | Bubble-up inmediato como `ValueError("LLM_ERROR: ...")`. |

> **Audit 2026-05-23**: el detector de cold start antes era `"loading" or "model" in body`. La palabra `model` aparece en casi cualquier error body OpenAI-compat (`model not found`, `model overloaded`, etc.), provocando esperas de 80 s ante errores permanentes. Se ajustó al string exacto `loading model`.

### 5.6 Usage / token accounting

`OpenAICompatAdapter.generate_stream` pasa `stream_options={"include_usage": True}` para que el proveedor emita un terminal chunk con `usage.prompt_tokens` y `usage.completion_tokens` que se vuelcan en `usage_sink`. Sin esta opción los streams nunca exponen token counts y las columnas `messages.tokens_prompt`/`tokens_completion` quedaban en 0/`completion_tokens` parcial.

### 5.7 Identidad y riesgo residual

Ver bloque de comentario `prompts.py:27-45`. Si Modal sirve el modelo BASE (sin fine-tune) por error de deploy, podría haber brand leak ("Soy Gemma"). Mitigaciones operativas:

1. Endpoint `GET /api/v1/llm/health` para pre-warming + observabilidad (cualquier respuesta atípica se ve en el primer smoke chat).
2. El script de deploy a Modal debe verificar hash del GGUF cargado.
3. Pendiente futuro: post-filter en `chat_service` que detecte `Soy Gemma|Google` y marque safety_event.

---

## 6. Voz

| Componente | Detalle |
|---|---|
| ASR | `faster-whisper>=1.0` — modelo configurable vía `WHISPER_MODEL` (default `base`). Carga lazy en el primer request. |
| TTS | `piper-tts>=1.4` — invocado como subprocess (la lib Python es wrapper). |
| Voz por defecto | `es_ES-mls_9972-low` (config `PIPER_VOICE`). |
| Modelo de voz | Baked en la imagen Docker en `/app/models/piper/` (~60 MB). Se descarga desde HuggingFace en `Dockerfile:66-70`. NO commitado al repo. |
| Path | `PIPER_MODEL_PATH=models/piper/` (relativo a WORKDIR `/app`). |
| Upload dir | `UPLOAD_DIR=uploads/audio/`. |

UX:

- Auto-play TTS, mute global (decisión PO 2026-02-23).
- Subtítulos word-by-word resaltados en burbuja, mic con borde rojo pulsante durante recording (`#DC2626`).
- Sin controles por burbuja, solo mute global.

> Avatar 3D y SER (Speech Emotion Recognition) están **diferidos a Fase 9**. El MVP usa avatar 2D ilustrado en `frontend/src/pages/Voice.tsx` + `components/voice/MabelAvatar.tsx`. Ver §11 ADR #14 actualizado.

---

## 7. Auth

| Componente | Detalle |
|---|---|
| Tokens | JWT HS256 stateless via PyJWT. |
| Hashing | bcrypt directo. |
| Secreto | `JWT_SECRET` env var. **Default `""`** en `config.py:17`. |
| Validación | El web service valida `JWT_SECRET` no vacío en el **lifespan hook** (`app/main.py:52-58`), aborta boot si está vacío. |
| Cron y scripts | NO requieren `JWT_SECRET`: pueden importar `settings` sin error y no firman JWTs. |

> **Audit 2026-05-24**: antes `JWT_SECRET` era `str` sin default y el cron crasheaba con `ValidationError` al importar `settings` aunque no use JWT. El default vacío + validación tardía resuelve eso sin debilitar el web.

Flujo:

- Login emite JWT con claims `{user_id, role, iat, exp}`.
- Interceptor axios (frontend `api/client.ts`) añade `Authorization: Bearer ...`.
- `middleware/auth.py` decode + `require_auth`, `require_consent`, `require_admin`.

---

## 8. Deploy

### 8.1 Dockerfile (multi-stage)

`Dockerfile` (87 líneas) — referencia exacta:

- **Stage 1 (`node:20-alpine`)**: instala deps frontend, `VITE_API_URL=/api/v1`, `npm run build`. Esto baked la base URL relativa para que axios pegue al mismo host del backend en Railway → cero CORS, sin segundo dominio.
- **Stage 2 (`python:3.11-slim`)**: instala `libpq5` y `curl`, copia `backend/`, copia `dist/` del Stage 1 a `/app/static/`, descarga voz Piper en `/app/models/piper/`.
- ENV: `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUNBUFFERED=1`, `PYTHONPATH=/app` (crítico para que `python scripts/seed_admin.py` resuelva `from app.core.config import settings`).
- Boot:
  ```
  alembic upgrade head \
    && python scripts/seed_admin.py \
    && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
  ```
  Si las dos primeras fallan, el container muere y Railway muestra el error en logs.
- `exec` para que uvicorn sea PID 1 → SIGTERM de Railway llega directo → shutdown graceful (lifespan corre, SSE se cierran limpias).

### 8.2 Railway — web service

- Detecta `Dockerfile` automáticamente.
- No usa `railway.toml` (no existe en raíz para evitar conflictos multi-servicio).
- Variables de entorno desde el dashboard.
- Logs a stdout (Uvicorn estándar; no se ha adoptado structlog).

### 8.3 Railway — cron service (separado)

`railway.cron.toml` define un servicio independiente que comparte el mismo repo y `DATABASE_URL`:

- `builder = "DOCKERFILE"`, `dockerfilePath = "Dockerfile"`.
- `cronSchedule = "0 3 * * *"` (diario 03:00 UTC = 22:00 Bogotá, off-peak).
- `startCommand = "alembic upgrade head && python -m scripts.redact_old_message_ids"`.
- `restartPolicyType = "NEVER"` — los crons deben terminar; reiniciar `ALWAYS`/`ON_FAILURE` loopearía la tarea fuera de horario y dispararía costos.
- No requiere `JWT_SECRET` ni `LLM_API_KEY` (solo lee/escribe Postgres).

> Setup manual UI: New service → mismo repo → Settings → Source → Config Path = `railway.cron.toml` → Add Reference para `DATABASE_URL`.

### 8.4 Modal.com — LLM serverless

- Endpoint OpenAI-compat (URL en `LLM_BASE_URL` de prod).
- T4 16 GB, scale-to-zero 5 min idle.
- Cold start 60–90 s, mitigado por UX en 3 capas (§9).
- Auth: `LLM_API_KEY` enviado como Bearer.

---

## 9. UX para LLM cold start — 3 capas

La latencia de cold start es la externalidad más visible del scale-to-zero de Modal. Tres capas atacan distintos momentos del journey:

### 9.1 Capa 1 — `streamingStatusText` (mensajería progresiva)

`frontend/src/utils/streamingStatus.ts`. Recibe `(elapsedSeconds, hasFirstToken)`.

| Elapsed | Mensaje |
|---|---|
| 0–3 s | "Mabel está pensando…" |
| 3–10 s | "Mabel está pensando una respuesta cuidadosa…" |
| 10–25 s | "Mabel se está tomando su tiempo para entenderte mejor…" |
| 25–60 s | "Mabel está despertando del descanso (esto puede tardar ~1 minuto la primera vez)…" |
| 60+ s | "Sigue procesando — el servidor de IA está cargando, dale unos segundos más." |
| (cualquiera con `hasFirstToken=true`) | "Mabel está escribiendo…" |

`hasFirstToken` evita la contradicción visual: si el elapsed acumulado durante el wait pre-tokens persistiera cuando llegan tokens, el indicador mostraría "despertando del descanso" mientras palabras aparecen en pantalla.

### 9.2 Capa 2 — Toast de cold start

Cuando `useLlmPrewarm` devuelve `status='cold'` o `'unknown'`, el cliente puede mostrar un toast informando que el modelo está despertando.

### 9.3 Capa 3 — `LlmStatusChip` en el header

`frontend/src/components/chat/LlmStatusChip.tsx`. Píldora compacta con popover ARIA-accesible. Estados: `warm`, `cold`, `down`, `unknown`. Renderizado en `pages/Chat.tsx:522` y `pages/Voice.tsx`.

### 9.4 Endpoint `GET /api/v1/llm/health`

`backend/app/routers/llm_health_router.py`. Hace `GET /models` al provider con timeout **15 s** (NO bajar de 12 s — cold start de Modal devuelve 503 dentro de 2–5 s pero proxies pueden tardar; con 5 s el health timeout-éa y devuelve `down` en vez de `cold`, defeat de la feature — audit 2026-05-23).

| Upstream | Devuelve |
|---|---|
| 200 | `{status: "warm", elapsed_ms}` |
| 503 | `{status: "cold", elapsed_ms}` (siempre HTTP 200 al cliente, status semántico en body) |
| otros | `{status: "down", elapsed_ms, http_status}` |
| timeout/exception | `{status: "down", reason}` |

Requiere usuario autenticado (`Depends(get_current_user)`); usuarios con cuenta deshabilitada quedan bloqueados antes de llegar al endpoint.

### 9.5 `useLlmPrewarm` (`frontend/src/hooks/useLlmPrewarm.ts`)

Hook React. Llama `/llm/health` al mount. Soporta `pollIntervalMs` (Chat y Voice polean cada 30 s).

**Page Visibility guard**: solo polea si `document.visibilityState === 'visible'`. Sin esto, tabs idle pingean 24/7, Modal scale-to-zero nunca dispara, y la factura del piloto explota. Al volver a visible se dispara un check inmediato.

**Estados** (`LlmStatus`): `warm | cold | down | unknown`.
**`checking` flag**: solo toggles `true` en el primer check (mount) o en `recheck()` manual — no en cada poll automático. Sin esto, los spinners de los consumers flickeaban cada 30 s sin razón.

Se monta en `pages/Home.tsx`, `pages/Chat.tsx`, `pages/Voice.tsx`.

---

## 10. Variables de entorno

Fuente: `backend/app/core/config.py` (al 2026-05-24).

| Variable | Default | Propósito |
|---|---|---|
| `DATABASE_URL` | (required) | Conexión Postgres. Acepta `postgres://`, `postgresql://` o `postgresql+asyncpg://`; se normaliza. |
| `JWT_SECRET` | `""` (validado en lifespan) | Secreto HS256 para JWTs. El web aborta boot si vacío; cron lo ignora. |
| `LLM_PROVIDER` | `openai_compat` | Selecciona adapter en factory. Alt: `gemini_native`. |
| `LLM_FLAVOR` | `generic` | Selecciona system prompt. Alt: `mabel_gemma4`. |
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` | Endpoint OpenAI-compat. En prod: URL de Modal. |
| `LLM_API_KEY` | `""` | Bearer key. Fallback automático a `GEMINI_API_KEY` via `settings.effective_llm_api_key`. |
| `LLM_MODEL` | `gemini-2.5-flash` | Identificador del modelo a invocar. En prod: el ID del fine-tune. |
| `LLM_TIMEOUT_MS` | `30000` | Timeout SDK OpenAI. |
| `GEMINI_API_KEY` | `""` | Legacy. Sirve como fallback de `LLM_API_KEY` y para `GeminiAdapter`. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Legacy adapter only. |
| `GEMINI_TIMEOUT_MS` | `30000` | Legacy adapter only. |
| `CORS_ORIGINS` | `http://localhost:5173` | CSV. Parseado en `cors_origins_list` property. |
| `CONTEXT_WINDOW_SIZE` | `20` | Número de mensajes recientes que `chat_service` pasa al LLM. |
| `WHISPER_MODEL` | `base` | Modelo faster-whisper. |
| `PIPER_VOICE` | `es_ES-mls_9972-low` | Voz por defecto. |
| `PIPER_MODEL_PATH` | `models/piper/` | Path relativo a WORKDIR del container. |
| `UPLOAD_DIR` | `uploads/audio/` | Dónde se persisten uploads de ASR. |
| `PORT` | (Railway) | Puerto del web service en Railway. |

> Variables `effective_*` no son del entorno sino properties de `Settings`: `effective_llm_api_key` resuelve `LLM_API_KEY → GEMINI_API_KEY → ""` para compatibilidad con `.env` legacy donde solo existía la segunda.

---

## 11. ADRs (decisiones arquitectónicas)

> Lista heredada del Notion "Tech Stack Definitivo" + actualizaciones contra el código. Las que cambiaron se marcan con tachado en el título original y nota de revisión.

### ADR #1 — ~~Monolito local 100% offline con Docker Compose~~ → **Arquitectura híbrida Railway + Modal**
**Revisado 2026-05-23.** El MVP original se diseñó "100% local". Hoy el deploy real es: container único en Railway (FastAPI + SPA + voz) + LLM serverless en Modal.com + cron service separado en Railway. El motivo del cambio: hosting cero-coste-fijo del fine-tune en Modal vs GPU local. Docker Compose sigue siendo el dev-loop local (Postgres + opcionalmente uvicorn).

### ADR #2 — SQLAlchemy 2.0 (no Tortoise ORM)
Vigente. Async nativo, documentación extensa, Alembic integrado.

### ADR #3 — JWT stateless con PyJWT (no sessions server-side)
Vigente. Stateless = friendly para Railway. PyJWT reemplazó a python-jose por discontinuación.

### ADR #4 — Zustand (no Redux, no Context API solo)
Vigente. Stores Zustand en `frontend/src/stores/`.

### ADR #5 — faster-whisper (no openai-whisper)
Vigente. 4× más rápido, menor memoria. Modelo configurable via `WHISPER_MODEL`.

### ADR #6 — Piper TTS (no Coqui TTS)
Vigente. Coqui archivado en 2024. Piper baked en imagen Docker.

### ADR #7 — Guardrails custom Python (no NeMo Guardrails en MVP)
Vigente. Middleware FastAPI + keywords + regex en español. Detalle en `backend/app/services/guardrails_service.py`.

### ADR #8 — Playwright para E2E (no Cypress)
**Pendiente real**: Playwright está documentado pero no instalado al 2026-05-24. No hay `playwright` en `package.json`. Decisión preservada para Fase 10.

### ADR #9 — SSE para streaming del chat
Vigente. `session_router.send_message` (línea 182) devuelve `StreamingResponse(sse_generator(), media_type="text/event-stream")` usando `fastapi.responses.StreamingResponse` con un generador async que formatea events SSE a mano (`data: ...\n\n`). **NO se usa `sse-starlette`** (no está en `requirements.txt`). Streaming token-by-token desde `OpenAICompatAdapter.generate_stream`.

### ADR #10 — Config en dos capas: infraestructura (env vars) vs operativa (`system_config`)
Vigente. Env vars para credenciales/endpoints; tabla `system_config` (TEXT PK) para `sos_hotline_numbers`, `safety_keywords`, `sos_severity_threshold`, `guardrails_enabled`. Audit_log captura cambios.

### ADR #11 — SER diferido a Post-MVP
Vigente. Reconocimiento emocional se hace vía check-in textual + guardrails. Interfaz `EmotionAnalyzer(Protocol)` no implementada todavía (no requerida).

### ADR #12 — PyJWT sobre python-jose
Vigente. Migración consumada.

### ADR #13 — PostgreSQL único motor (eliminación de SQLite dual)
Vigente. `db/schema_postgresql.sql` único DDL; SQLite eliminado de cualquier path del proyecto.

### ADR #14 — ~~Avatar 3D + lip sync con Web Audio API + three-vrm~~ → **Diferido a Fase 9; MVP usa avatar 2D ilustrado**
**Revisado 2026-05-23.** No hay `@react-three/fiber`, `@react-three/drei`, `three`, ni `@pixiv/three-vrm` en `frontend/package.json`. El modo voz usa `pages/Voice.tsx` + `components/voice/MabelAvatar.tsx` (2D ilustrado). La decisión técnica original en `docs/AVATAR_3D_DECISION_TECNICA.md` se preserva para Fase 9.

### ADR #15 (nuevo) — Adapter pattern LLM con OpenAI-compat por defecto
**2026-05-21.** `LLM_PROVIDER=openai_compat` es default. Cambiar a cualquier proveedor que exponga `/v1/chat/completions` requiere solo 3 env vars (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). Detalle en §5. Selección de prompt vía `LLM_FLAVOR` explícito, no por substring match en model name (audit 2026-05-23).

### ADR #16 (nuevo) — Deploy en Railway con web + cron service separados
**2026-05-22.** Web service usa `Dockerfile` por defecto sin `railway.toml`. Cron service usa `railway.cron.toml` apuntando al mismo `Dockerfile` con `startCommand` distinto y `restartPolicyType = "NEVER"`. Justificación operativa en comentarios de `railway.cron.toml:1-27`.

### ADR #17 (nuevo) — Cron L2 redacta `message_id` de `safety_events.payload` a 30 días
**2026-05-22.** Cumple minimización Art. 4 Ley 1581/2012. Script idempotente `backend/scripts/redact_old_message_ids.py`. Cláusula `payload ? 'message_id'` evita actualizar filas ya redactadas. Disparado por `railway.cron.toml` a `0 3 * * *`. Política detallada en `docs/DATA_RETENTION_POLICY.md`.

### ADR #18 (nuevo) — `JWT_SECRET` default vacío + validación en lifespan
**2026-05-24.** Permite que el cron service importe `settings` sin fallar; el web aborta boot si vacío. Audit en `config.py:11-17` y `main.py:36-58`.

---

## 12. Convenciones obligatorias

| Tema | Regla | Fuente |
|---|---|---|
| Documentación de librerías | Consultar Context7 MCP antes de escribir código que use cualquier lib externa. | `CLAUDE.md` |
| Mockups `.pen` | Usar herramientas Pencil MCP, **NUNCA** Read/Grep sobre el binario. | `CLAUDE.md` |
| Cambios de schema BD | Invocar skill `database-schema-designer` antes de modificar tablas/columnas. | `CLAUDE.md` |
| UI nueva o modificada | Invocar skill `frontend-design` antes de crear/modificar componentes. | `CLAUDE.md` |
| Identidad del LLM | Nunca exponer Google/Gemini. Mabel IA es la única identidad. Garantizado por fine-tuning (Gemma4) o por system prompt (genérico). | `prompts.py` |
| Idioma | Contenido user-facing en español (es-CO). Identificadores de código en inglés. | Convención de proyecto. |
| Auth | PyJWT (NO python-jose). bcrypt directo (NO passlib). | `requirements.txt` |
| Code review | Skill `code-review` (high-effort) antes de commits grandes. | Memoria `code-review-workflow.md` |
| Doc admin panel | Mantener `docs/ADMIN_PANEL.md` actualizado en cada fix del panel. | Memoria `admin-panel-doc.md` |

---

## 13. Drift detectado / pendientes

Hallazgos del proceso de consolidación que NO se corrigieron en este doc y quedan para los dueños de cada área:

1. **PWA (D-15)**: Notion documenta como decisión aprobada (2026-03-01) el uso de `vite-plugin-pwa`. No instalado en `frontend/package.json`. Backlog para Fase 10.
2. **Playwright (ADR #8)**: documentado como E2E framework oficial pero no instalado. No hay `playwright` ni `@playwright/test` en deps. Decisión a confirmar para Fase 10.
3. **structlog**: documentado en Notion como logging oficial. No está en `backend/requirements.txt`. El backend usa `logging` stdlib. Considerar añadirlo o bajar la promesa "structured logs".
4. **Vitest**: documentado en Notion. No instalado en frontend. No hay tests JS al 2026-05-24.
5. **httpx**: documentado en Notion como cliente HTTP test. Sí se importa en `llm_health_router.py` pero NO está en `requirements.txt` — viene transitivamente vía `openai>=1.50`. Considerar pinearlo explícito.
6. **`db/schema_postgresql.sql`** vs Alembic: el DDL en `db/` ha divergido del estado real. Alembic tiene 10 archivos en `backend/alembic/versions/` (1 initial + 2 seeds + 7 evolutivas: `006_research_instrumentation`, `007_timestamptz_conversion`, `008_audit_logs_actor`, `009_greeting_unique_empathy_updated`, `010_safety_keywords_structured`, `011_session_ratings`, `012_sessions_hidden`). El DDL declarativo solo refleja 14 CREATE TABLE — falta `session_ratings` (Evo 011) y `sessions.hidden_at/hidden_reason` (Evo 012). Recomendado regenerar el DDL desde `pg_dump --schema-only` post `alembic upgrade head`.
7. **Node version**: Notion dice Node 22 LTS; Dockerfile usa Node 20-alpine en Stage 1. No es bug (Vite 7 corre en Node ≥18) pero hay drift documental.
8. **Python version**: Notion dice 3.12.x; Dockerfile usa python:3.11-slim. Tampoco es bug pero hay drift.
9. **Avatar 3D + SER**: bloque completo del Notion (ADR #14, sección "Avatar 3D y Lip Sync", Agente 15) sigue como diferido. Si se ejecuta Fase 9, instalar `@react-three/fiber`, `@react-three/drei`, `three`, `@pixiv/three-vrm` y actualizar este doc. MVP actual usa avatar 2D ilustrado (`frontend/src/components/voice/MabelAvatar.tsx`).
