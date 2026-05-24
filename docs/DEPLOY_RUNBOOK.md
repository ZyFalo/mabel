# Deploy Runbook — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `899bd44`
> **Audiencia**: ops / dev haciendo deploy o troubleshooting
> **Cobertura**: Railway (web service + cron service) + Modal.com (LLM Mabel-Gemma4) + DB (Railway Managed Postgres)
> **Pre-requisito de lectura**: `docs/TECH_STACK.md` §8 (resumen del deploy) y `docs/DATA_RETENTION_POLICY.md` §10 (cron L2).

Este documento sigue una promesa estricta: cualquier dev/ops que abra un incidente a las 3 a.m. debe poder desplegar Mabel IA desde cero, o resolver el problema, sin abrir Notion ni preguntar en Discord. Si encuentras un paso que requiere "preguntar al equipo", abre un PR contra este archivo.

---

## 1. Pre-requisitos

Antes de tocar Railway o Modal:

| Recurso | Para qué | Cómo se obtiene |
|---|---|---|
| Cuenta Railway (Team o Hobby) | Hospedar el web service + cron + Postgres | https://railway.com signup con GitHub |
| Cuenta Modal.com | Servir el LLM Mabel-Gemma4-E4B (scale-to-zero, GPU T4) | https://modal.com signup; añadir tarjeta al hit free tier |
| Acceso al repo `Mabel-IA` | Railway lo conecta vía OAuth GitHub | Permiso de lectura mínimo; recomendado write para PRs de ops |
| Acceso al repo `Gemma4-Mabel` | Deploy del LLM en Modal (repo separado, fuera de este monorepo) | Pedir invitación al PO si no aparece en tu org |
| GitHub CLI o navegador | Para revisar logs y abrir incidentes | `brew install gh` opcional |
| `openssl` o `python -c "import secrets;print(secrets.token_hex(32))"` | Generar `JWT_SECRET` | Ya viene con macOS y Linux |
| Cliente Postgres opcional (`psql` o TablePlus) | Inspeccionar Postgres si algo se rompe | `brew install libpq` y `brew link --force libpq` |

**No** necesitas:

- Crear ningún `railway.toml` adicional. El web service usa el `Dockerfile` por defecto; el cron service usa `railway.cron.toml` ya commiteado.
- Configurar DNS ni certificados (Railway expone un subdominio gratuito `*.up.railway.app` con TLS).
- Tocar la cuenta de Google Gemini para el deploy productivo (Mabel ya no depende de Gemini en prod; ese SDK queda como fallback `LLM_PROVIDER=gemini_native`).

---

## 2. Arquitectura del deploy

```
                          INTERNET (HTTPS)
                                 │
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │  Railway "web" service                           │
        │  ─────────────────────                           │
        │  • Dockerfile (multi-stage)                      │
        │  • Stage 1: Vite build → /app/static             │
        │  • Stage 2: FastAPI sirviendo API + SPA          │
        │  • Boot: alembic upgrade + seed_admin + uvicorn  │
        │  • Voz Piper baked (~60 MB en /app/models/piper) │
        │  • Whisper lazy load en primer request           │
        └────┬─────────────────┬──────────────────┬────────┘
             │                 │                  │
             │ DATABASE_URL    │ LLM_BASE_URL     │ (no traffic)
             │ (reference)     │ + LLM_API_KEY    │
             ▼                 ▼                  │
   ┌─────────────────┐  ┌──────────────────┐      │
   │ Railway Postgres │  │  Modal.com       │      │
   │   plugin         │  │  Mabel-Gemma4-   │      │
   │  PG 16, asyncpg  │  │  E4B (T4 16GB)   │      │
   │                  │  │  scale-to-zero   │      │
   │  pgcrypto ext.   │  │  cold start ~75s │      │
   └────────▲─────────┘  └──────────────────┘      │
            │                                      │
            │ DATABASE_URL (reference)             │
            │                                      │
   ┌────────┴─────────────────────────────────────┐│
   │  Railway "cron" service (mismo repo)         ││
   │  ────────────────────────────────────        ││
   │  • railway.cron.toml (Config Path)           ││
   │  • cronSchedule: 0 3 * * * (UTC)             ││
   │  • startCommand:                             ││
   │     alembic upgrade head &&                  ││
   │     python -m scripts.redact_old_message_ids ││
   │  • restartPolicyType = NEVER                 ││
   │  • Sin LLM_* ni JWT_SECRET                   ││
   └──────────────────────────────────────────────┘│
                                                   │
                                                   ▼
                                          (sin tráfico al LLM)
```

Tres servicios en Railway (web, Postgres plugin, cron) y un servicio externo (Modal). El web es el único que recibe tráfico HTTP de usuarios; el cron es batch nocturno; Modal solo se invoca desde el web. No hay reverse proxy adicional ni CDN: el SPA se sirve desde el mismo FastAPI con catch-all (`app/main.py`) y `VITE_API_URL=/api/v1` se baked en la build para que axios use rutas relativas y evite CORS.

---

## 3. Primer deploy (paso a paso)

### 3.1 Crear el proyecto Railway y el web service

1. **Login** en https://railway.com con la cuenta GitHub que tiene acceso al repo.
2. **New Project** → **Deploy from GitHub repo** → seleccionar `ZyFalo/Mabel-IA`.
3. Railway detecta el `Dockerfile` y crea un servicio por defecto. Renombrarlo a `web` (Settings → General → Service Name → `web`).
4. **NO disparar el primer deploy todavía**: faltan env vars y el Postgres. Si Railway lo encoló, esperar a que termine (fallará por falta de `DATABASE_URL`) o cancelarlo desde Deployments.

### 3.2 Añadir Postgres como plugin

1. En el proyecto → **+ New** → **Database** → **PostgreSQL**.
2. Railway provisiona un Postgres 16 y crea las variables `DATABASE_URL`, `PGUSER`, `PGPASSWORD`, `PGHOST`, etc.
3. Adjuntarla al `web` service como **Reference variable**:
   - `web` → **Variables** → **+ New Variable** → **Add Reference** → seleccionar `${{Postgres.DATABASE_URL}}`.
   - Nombre exacto: `DATABASE_URL` (case-sensitive; Pydantic Settings lo lee así).
4. La URL inyectada empieza por `postgresql://` o `postgres://`. **No hay que normalizarla manualmente** — `_coerce_async_pg_url` en `backend/app/core/config.py` la transforma a `postgresql+asyncpg://` al import.

### 3.3 Generar `JWT_SECRET`

En la terminal local:

```bash
openssl rand -hex 32
# Ejemplo de output (no usar este):
# 9f3e7b2c1a4d8e6f5b9c0d3a2e1f4b7c8d9e6f5a4b3c2d1e0f9a8b7c6d5e4f3a
```

Alternativa Python (sin openssl):

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Reglas:

- 64 chars hex (32 bytes de entropía) cubre HS256 con margen.
- Rotar implica invalidar todas las sesiones activas; documentar en `audit_logs` si se hace post-piloto.
- **Nunca commitear ni pegar en Slack/Discord**. Solo en Railway Variables.

### 3.4 Configurar variables de entorno del `web` service

Pegar en Railway → `web` → Variables (Add Reference para `DATABASE_URL`, el resto Plain Variable):

| Variable | Valor | Por qué |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Reference) | Conexión a Postgres. Se normaliza a asyncpg en config.py. |
| `JWT_SECRET` | (el hex del paso 3.3) | HS256 sign/verify. Web aborta boot si vacío (lifespan en `app/main.py`). |
| `LLM_PROVIDER` | `openai_compat` | Default del factory. Activa `OpenAICompatAdapter`. |
| `LLM_FLAVOR` | `mabel_gemma4` | Selecciona el system prompt fijo del fine-tune. NO usar `generic` en prod. |
| `LLM_BASE_URL` | `https://<workspace>--<app>-serve.modal.run/v1` | Endpoint OpenAI-compat de Modal (paso 4.2). |
| `LLM_API_KEY` | (token Modal del paso 4.3) | Bearer auth contra Modal. |
| `LLM_MODEL` | `mabel-gemma4-e4b` | ID del modelo configurado en Modal app. |
| `LLM_TIMEOUT_MS` | `180000` | 180s. Cubre cold start + warm-up + primer stream. NO bajar a 30000 (default) en prod. |
| `ADMIN_EMAIL` | `admin@umb.edu.co` (ejemplo) | Email del admin seed. Lower-case forzado por el script. |
| `ADMIN_PASSWORD` | (contraseña fuerte, ≥8 chars, 1 mayús, 1 número, 1 especial) | Pol. de password validada por `seed_admin.py:_PASSWORD_RULES`. |
| `ADMIN_DISPLAY_NAME` | `Administrador` (opcional) | Default si se omite. |
| `CORS_ORIGINS` | `https://<app-name>.up.railway.app` | URL pública del web. **Sin trailing slash, sin path**. CSV si hay más de un origen. |
| `CONTEXT_WINDOW_SIZE` | `20` | Número de mensajes recientes que el chat_service pasa al LLM. |
| `WHISPER_MODEL` | `base` | Modelo faster-whisper (lazy load). |
| `PIPER_VOICE` | `es_ES-mls_9972-low` | Voz baked en el Dockerfile. **No cambiar** sin baked otra voz nueva. |
| `PIPER_MODEL_PATH` | `models/piper/` | Relativo a WORKDIR `/app`. Coincide con la ruta del Dockerfile. |
| `UPLOAD_DIR` | `uploads/audio/` | Persiste uploads de ASR. Volátil en Railway (sin volumen montado). |

Variables **opcionales / legacy**:

| Variable | Cuándo setearla |
|---|---|
| `GEMINI_API_KEY` | Solo si quieres usar el fallback `LLM_PROVIDER=gemini_native` o si dejas `LLM_API_KEY=""` y quieres que `settings.effective_llm_api_key` haga fallback. |
| `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` | Solo si activas el adapter Gemini nativo. |
| `PORT` | Railway lo inyecta automáticamente; el Dockerfile lo lee con `${PORT:-8000}`. No setear a mano. |

**Generar la URL pública** antes de fijar `CORS_ORIGINS`:

- En `web` → **Settings** → **Networking** → **Generate Domain**. Railway crea `<algo>.up.railway.app`.
- Copiar la URL completa (con `https://`, sin path) y pegarla en `CORS_ORIGINS`.

### 3.5 Disparar el primer deploy

Una vez todas las vars están seteadas:

- Railway re-encola automáticamente cuando detecta cambios en variables.
- Si no se dispara solo: `web` → **Deployments** → **Deploy** (botón arriba a la derecha).
- Tiempo esperado: **5–8 min** (frontend build + Python deps + descarga voz Piper).

### 3.6 Boot sequence — qué pasa cuando Railway arranca el container

El `CMD` del Dockerfile (líneas 85-87) ejecuta tres pasos en orden, encadenados con `&&`:

```
alembic upgrade head \
  && python scripts/seed_admin.py \
  && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

1. **`alembic upgrade head`** — Aplica todas las migraciones pendientes desde `backend/alembic/versions/`. Al 2026-05-24 son 10 archivos (1 initial + 2 seeds + 7 evolutivas 006-012). Si una falla (sintaxis, constraint violada, conflict de revision), el container muere y Railway muestra el traceback. Alembic es idempotente: si la BD ya está en head, no hace nada.
2. **`python scripts/seed_admin.py`** — Idempotente. Lee `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_DISPLAY_NAME` del entorno y:
   - Si no están seteadas → log warning, exit 0 (no rompe deploy).
   - Si el usuario no existe → lo crea con `role='admin'`.
   - Si existe con la misma password → no-op.
   - Si la password cambió en Railway → actualiza el hash en BD (rotación pasiva).
   - Si la cuenta fue **deshabilitada manualmente** (`disabled_at IS NOT NULL`) → NO la re-activa (compliance D-03/D-05; el operador debe limpiar `disabled_at` vía panel admin).
   - Si `ADMIN_PASSWORD` no cumple política (8+ chars, mayús, número, especial) → exit 1, container muere. Mensaje exacto en logs.
3. **`exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`** — Reemplaza al shell como PID 1. Importante para que SIGTERM de Railway llegue directo a uvicorn y dispare graceful shutdown (lifespan corre, SSE se cierran limpias, sin SIGKILL después de 30s).

Si **cualquiera de los pasos 1-2 falla**, el container muere antes de arrancar uvicorn. Railway lo marca como `CRASHED` y muestra los logs del intento.

### 3.7 Health check post-deploy

Cuando los logs muestren `Uvicorn running on http://0.0.0.0:PORT`:

```bash
curl https://<app-name>.up.railway.app/api/v1/health
# Esperado: {"status":"ok"}
```

Verificar admin login:

1. Abrir `https://<app-name>.up.railway.app/login` en el navegador.
2. Login con `ADMIN_EMAIL` + `ADMIN_PASSWORD`.
3. Si redirige a `/admin/dashboard` → seed funcionó.
4. Si redirige a `/consent` o `/access-denied` → el seed no marcó el `role='admin'` (revisar logs del seed).

---

## 4. Configurar Modal.com (LLM)

### 4.1 Setup inicial

El LLM vive en un **repo separado** fuera de este monorepo: [`github.com/ZyFalo/Gemma4-Mabel`](https://github.com/ZyFalo/Gemma4-Mabel). El README de ese repo es la fuente de verdad de cómo deployar el modelo. Para el detalle completo (training, eval, 8 bugs de Modal resueltos, etc.) ver `docs/MODEL_TRAINING.md` — índice navegable a los 23 docs externos. Resumen mínimo aquí para contexto:

1. Clonar `Gemma4-Mabel`.
2. Instalar Modal CLI: `pip install modal`.
3. Autenticar: `modal token new` → abre browser, crea token y lo guarda en `~/.modal.toml`.
4. Deploy: `modal deploy app.py` (nombre exacto del entry depende del repo; revisar su README).

Detalles que **no** se duplican aquí: parámetros de la GPU, GGUF quantization (Q4_K_M), scale-to-zero threshold (5 min idle), warm-up script. Todo eso vive en `Gemma4-Mabel`.

### 4.2 Obtener la URL del endpoint

Después de `modal deploy`:

```bash
modal app list
# Output similar a:
#   Name                          Created      State     URL
#   mabel-gemma4                  2026-05-22   deployed  https://<workspace>--mabel-gemma4-serve.modal.run
```

La URL completa para `LLM_BASE_URL` debe terminar en `/v1`:

```
https://<workspace>--mabel-gemma4-serve.modal.run/v1
```

Si el suffix `/v1` se omite, el SDK OpenAI le añade `/chat/completions` directamente al root y el 404 será inmediato en el primer chat. Verificar con:

```bash
curl https://<workspace>--mabel-gemma4-serve.modal.run/v1/models \
  -H "Authorization: Bearer <token>"
# Esperado: 200 con un JSON de modelos, o 503 "loading model" durante cold start.
```

### 4.3 Token de API de Modal

1. Modal dashboard → **Settings** → **API Tokens** → **New token**.
2. Copiar el token (formato `mok_...` o similar; depende de la versión de Modal).
3. Pegarlo en Railway → `web` → Variables → `LLM_API_KEY`.

**Importante**: Modal soporta tokens scoped por app. Si la org tiene múltiples apps Modal, scopear el token a `mabel-gemma4` reduce blast radius si se filtra.

### 4.4 Verificación del primer chat

Desde la UI del web service:

1. Crear cuenta estudiante (registro normal).
2. Aceptar consentimiento.
3. Completar onboarding.
4. Llenar check-in.
5. Mandar primer mensaje en el chat.

Lo esperado:

- **Si el modelo está cold**: el chip de estado `LlmStatusChip` en el header muestra "cold". El primer mensaje tarda 60–90s. El indicador rota por los mensajes de `streamingStatusText.ts` ("Mabel está pensando…" → "despertando del descanso…").
- **Si está warm**: respuesta empieza a streamear en <3s.

Si después de 180s no hay respuesta y hay logs `LLM_ERROR: timeout` en Railway → revisar §6.2.

---

## 5. Configurar el cron service de redacción L2

### 5.1 Crear el segundo servicio en Railway

1. En el mismo proyecto → **+ New** → **GitHub Repo** → seleccionar `Mabel-IA` (**mismo repo**, no fork).
2. Renombrar a `cron-redact` (Settings → General).
3. **Settings → Source → Config Path** → poner exactamente `railway.cron.toml`.
4. Railway lee ese archivo y aplica:
   - `builder = "DOCKERFILE"`
   - `dockerfilePath = "Dockerfile"` (mismo Dockerfile que el web)
   - `cronSchedule = "0 3 * * *"` (diario 03:00 UTC = 22:00 hora Bogotá)
   - `startCommand = "alembic upgrade head && python -m scripts.redact_old_message_ids"`
   - `restartPolicyType = "NEVER"`

### 5.2 Variables del cron service

Solo **una** variable:

| Variable | Valor | Por qué |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Reference) | El cron lee/escribe Postgres y nada más. |

**No setear**:

- `JWT_SECRET` — el cron no firma JWTs. El default `""` en `config.py` (line 17) permite que `settings` se importe sin error. Si pones uno duplicado del web, no rompe pero contamina el blast radius si se filtra.
- `LLM_*` — el cron no llama al LLM. Pasar el `LLM_API_KEY` aquí solo amplía la superficie de leak.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — el cron NO ejecuta `seed_admin.py`. Su `startCommand` sobrescribe el `CMD` del Dockerfile.
- `CORS_ORIGINS`, `WHISPER_*`, `PIPER_*`, `UPLOAD_DIR` — no aplican.

### 5.3 Comportamiento esperado del cron

Railway dispara el `startCommand` **dos veces distintas**:

1. **Una vez por cada deploy** (cuando hay push a `main` o cambio en config). Es by-design de Railway, no un bug. La idempotencia del UPDATE (`payload ? 'message_id'`) hace que sea seguro.
2. **Cada vez que dispara el `cronSchedule`** (`0 3 * * *` UTC).

`restartPolicyType = "NEVER"` significa que **si el job falla** (DB down, query inválida), Railway **no** reintenta. La próxima ranura del cron lo intentará de nuevo. Esto es intencional: si reiniciara `ALWAYS` o `ON_FAILURE`, el container loopearía fuera de horario y dispararía costos de compute.

### 5.4 Verificar el primer run

Después del deploy del cron service:

1. `cron-redact` → **Deployments** → click en el último deploy → **Logs**.
2. Buscar líneas con `[redact_message_ids]`. Ejemplos:

```
[redact_message_ids] redacted message_id from 0 safety_events older than 30 days
```

- `0` en el primer deploy es **lo esperado**: la BD recién creada no tiene safety_events de >30 días.
- Si hay `ERROR:` en stderr → revisar §6.3.
- Si los logs solo muestran `alembic upgrade head` y nada del cron → revisar que `restartPolicyType` no esté como `ALWAYS` (rompería el orden de ejecución).

### 5.5 Validación end-to-end (opcional)

Si quieres confirmar que el cron redacta de verdad, ver `docs/DATA_RETENTION_POLICY.md` §10 "Validación / smoke test". Reproduce el escenario completo en local con Postgres del docker compose.

---

## 6. Troubleshooting

### 6.1 El web service no arranca

| Síntoma en logs | Causa probable | Fix |
|---|---|---|
| `pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings\nJWT_SECRET\n  String should have at least 1 character` | `JWT_SECRET` no seteado o vacío. El web valida en lifespan (`app/main.py:52-58`) y aborta. | Generar uno con `openssl rand -hex 32`, pegarlo en Railway Variables. |
| `pydantic_core._pydantic_core.ValidationError: ... DATABASE_URL\n  Field required` | Falta `DATABASE_URL` o no se añadió como Reference. | Variables → Add Reference → `${{Postgres.DATABASE_URL}}`. |
| `asyncpg.exceptions.InvalidCatalogNameError: database "railway" does not exist` | Postgres plugin sin schema. Raro. | Re-provisionar el plugin Postgres. |
| `asyncpg.exceptions.ConnectionDoesNotExistError` o `OSError: [Errno 110] Connection timed out` | DATABASE_URL apunta a un host que ya no existe (plugin borrado y re-creado). | Re-vincular Reference. Forzar Redeploy. |
| `alembic.util.exc.CommandError: Can't locate revision identified by 'xxx'` | Migration desincronizada (alguien hizo squash sin reset). | Confirmar `alembic_version` en BD vs `backend/alembic/versions/`. Si la BD tiene una revision que ya no existe → `alembic stamp head` desde Railway shell (destructivo, hacer backup). |
| `sqlalchemy.exc.IntegrityError: duplicate key value violates unique constraint` durante `alembic upgrade head` | Migration `009_greeting_unique_empathy_updated` o `011_session_ratings` chocó con data sucia | Conectar `psql` a Railway Postgres, limpiar duplicados manualmente, re-deploy. |
| `[seed_admin] ADMIN_PASSWORD no cumple politica — al menos 1 caracter especial. Aborto el seed para no introducir credenciales debiles.` | Password de admin débil. | Subir entropía (≥8 chars + 1 mayús + 1 número + 1 símbolo) y re-deploy. |
| `ModuleNotFoundError: No module named 'app'` durante `seed_admin.py` | `PYTHONPATH=/app` no se está respetando. | Verificar que el Dockerfile no fue modificado; la línea `ENV ... PYTHONPATH=/app` debe estar presente. |
| `huggingface.co` 404 o timeout durante el build | Voz Piper no descargó. | Re-build (Railway → Redeploy). Si persiste, el modelo de HF puede haber cambiado de URL — revisar `Dockerfile:67-70` y `scripts/setup-piper.sh`. |

### 6.2 El chat no responde

| Síntoma | Causa | Fix |
|---|---|---|
| Timeout >30s en el primer mensaje y se ve `cold` en el chip | Cold start de Modal. Normal en la primera invocación tras 5min idle. | Esperar hasta ~90s. `LLM_TIMEOUT_MS=180000` cubre. El adapter hace 8 retries × 10s ante 503 "loading model". |
| 401 en cada chat. Logs `LLM_ERROR: ... Incorrect API key` | `LLM_API_KEY` mal seteado o token Modal revocado. | Re-generar token en Modal dashboard, actualizar en Railway. |
| 404 en cada chat. Logs `LLM_ERROR: ... Not Found` | `LLM_BASE_URL` mal (probable: falta `/v1` al final, o URL del workspace incorrecta). | Confirmar con `curl <url>/v1/models -H "Authorization: Bearer <token>"`. La URL completa debe terminar en `/v1`. |
| `LLM_ERROR: Model 'xxx' not found` en logs del chat | `LLM_MODEL` no coincide con el ID configurado en la app Modal. | Revisar `app.py` del repo `Gemma4-Mabel` para el ID exacto, ajustar `LLM_MODEL` en Railway. |
| 503 "Loading model" repetido más allá de 90s | Modal warm pool agotado, GPU no disponible, fine-tune mal cargado. | Verificar Modal dashboard → invocations + GPU utilization. Si la app está en `failed` state → re-deploy desde el repo `Gemma4-Mabel`. |
| Respuesta empieza pero se corta a mitad | Network blip o `LLM_TIMEOUT_MS` superado por una respuesta muy larga. | Subir `LLM_TIMEOUT_MS` (con cuidado: bloquea workers ASGI). Revisar `services/chat_service.py` para `context_window_size`. |
| El modelo responde "Soy Gemma" o "Soy Google" | Modal sirvió el modelo BASE sin fine-tune. Brand leak crítico. | **Detener tráfico inmediatamente**. Revisar deploy en Modal, verificar hash del GGUF cargado. `LLM_FLAVOR=mabel_gemma4` NO mete protecciones de identidad — eso depende del fine-tune. |

### 6.3 El cron no corre

| Síntoma | Causa | Fix |
|---|---|---|
| No aparece ningún log nocturno en `cron-redact` | `restartPolicyType` mal configurado (Railway puede haberlo overridden via UI). | Verificar en `cron-redact` → Settings → que el toml está siendo leído. Si no, eliminar el servicio y re-crear con Config Path correcto. |
| Logs muestran `relation "safety_events" does not exist` | Day-0 race: el cron arrancó antes de que el web aplique migraciones. | El `startCommand` ya prepende `alembic upgrade head` para mitigar. Si persiste: deployar el `web` primero, esperar que termine `alembic upgrade head`, después deployar el `cron-redact`. |
| `ValidationError: JWT_SECRET` en el cron | El default `""` no se está aplicando. Probable: `config.py` fue modificado y revirtió el default. | Revisar `backend/app/core/config.py:17` — debe ser `JWT_SECRET: str = ""`. Si no, restaurar y re-deploy. |
| `[redact_message_ids] ERROR: TimeoutError` | Postgres lento o en mantenimiento. `_CONNECT_ARGS` está en `timeout=10, command_timeout=30`. | Verificar Railway Postgres status. Si está en restart, esperar al próximo cron tick. |
| Cron corre cada 5 min en vez de diario | `cronSchedule` mal formateado. | Confirmar en `railway.cron.toml` línea 36 que dice `"0 3 * * *"`. Cron syntax estándar: minuto hora día mes weekday. |
| El cron se quedó "running" indefinidamente en Railway | Bug raro de Railway con tareas batch. | Cancelar el deploy manualmente. Si recurre → abrir ticket Railway support. |

### 6.4 El admin no puede entrar

| Síntoma | Causa | Fix |
|---|---|---|
| Login con `ADMIN_EMAIL` falla con "credenciales incorrectas" | `ADMIN_PASSWORD` no llegó al seed (probable: env vars añadidas DESPUÉS del primer deploy). | Forzar Redeploy del web. El seed corre en cada boot y actualiza el hash. |
| Login OK pero redirige a `/access-denied` | `role` no quedó `admin` (raro). | Verificar en logs `[seed_admin] created admin ...` o `[seed_admin] updated admin ...`. Si dice `already up-to-date` pero el role no es admin → bug; conectar a Postgres y `UPDATE users SET role='admin' WHERE email='...'`. |
| Logs muestran `[seed_admin] admin xxx esta deshabilitada` | La cuenta fue deshabilitada manualmente desde el panel admin. El seed NO la re-activa (compliance D-03/D-05). | Vía panel admin (con otra cuenta admin) → reactivar. Si NO hay otra cuenta admin → conectar a Postgres y `UPDATE users SET disabled_at=NULL, disabled_reason=NULL WHERE email='...'`. |
| `[seed_admin] ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping.` | Las vars no llegaron al container. | Verificar Variables → Plain Variable (no Reference). Casing exacto: `ADMIN_EMAIL`. |

### 6.5 La UI no carga / 404 en la raíz

| Síntoma | Causa | Fix |
|---|---|---|
| `Cannot GET /` o 404 en la raíz | Stage 1 del Dockerfile falló silencioso; `/app/static` está vacío. | Revisar logs del build. Si `npm run build` falló, re-deploy. |
| La UI carga pero las llamadas API dan 404 | `VITE_API_URL` se cambió en el Dockerfile o se sobreescribió. | Confirmar que `Dockerfile:22` dice `ENV VITE_API_URL=/api/v1`. |
| CORS errors en el browser console | `CORS_ORIGINS` no incluye la URL pública de Railway. | Añadir la URL completa (con `https://`, sin trailing slash) a `CORS_ORIGINS`. CSV si hay varios orígenes. |
| Avatar/voz no funciona | Whisper/Piper no se inicializaron (lazy load falló) | Logs del primer request de ASR. Si dice `models/piper/es_ES-mls_9972-low.onnx not found` → el Stage 2 del Dockerfile no descargó la voz. Re-deploy. |

---

## 7. Rollback

### 7.1 Rollback del web service

- Railway → `web` → **Deployments** → buscar el último deploy verde (status `Success`).
- Click en los 3 puntos del deploy verde → **Redeploy**.
- Tiempo: ~3 min (sólo re-arranca el container, no re-builda).
- Las migrations corren con `alembic upgrade head` en cada boot. **Si el deploy actual aplicó una migration destructiva**, el redeploy del commit anterior NO la revierte automáticamente — Alembic no hace downgrade de cambios de data.

### 7.2 Rollback de migrations

Alembic soporta `downgrade` solo para cambios reversibles (DDL). Para data destructiva o columnas dropeadas, la única vía es:

1. Snapshot/backup de Postgres (Railway → Postgres → **Backups** → manual snapshot).
2. Si la BD está rota: Postgres → **Settings** → **Restore from backup** (requiere Pro plan).
3. Si la BD está OK pero quieres deshacer una mig específica: conectar `psql` y ejecutar manualmente el inverso del SQL de la mig. Documentar el undo en `audit_logs`.

**Best practice**: antes de cualquier mig con `op.drop_column`, `op.drop_table` o `DELETE FROM`, tomar snapshot manual en Railway.

### 7.3 Rollback del cron service

- Si el cron empezó a corromper datos: editar `railway.cron.toml` localmente, comentar el `cronSchedule` → push → Railway deploya el toml nuevo → cron pausado.
- El `startCommand` aún corre una vez por deploy. Si quieres desactivarlo del todo: cambiar `startCommand = "echo 'cron paused'"` y push.
- Restaurar: revertir el commit y push.

### 7.4 Rollback de Modal

- Modal mantiene revisions por deploy.
- Desde el repo `Gemma4-Mabel`: `modal deploy app.py --tag <revision-anterior>` (sintaxis exacta en su README).
- Mientras tanto, **NO** redeployes el web service con un `LLM_MODEL` que no exista en Modal — fallará todo chat.

---

## 8. Monitoreo

### 8.1 Railway

| Recurso | Cómo |
|---|---|
| Logs en tiempo real | `web` (o `cron-redact`) → **Deployments** → último deploy → **Logs**. Filtros por nivel. |
| Métricas CPU/Mem | Service → **Metrics**. Útil para detectar memory leaks en Whisper. |
| Estado de la BD | Postgres → **Metrics** + **Connections**. Si conexiones >40 sostenido, revisar pool de SQLAlchemy. |
| Alertas | Railway free tier no tiene alerting nativo. Usar Webhooks (Settings → Webhooks) hacia Discord/Slack para `deployment.failed`. |

### 8.2 Modal

| Recurso | Cómo |
|---|---|
| Invocations | Modal dashboard → app `mabel-gemma4` → **Invocations**. Latencia p50/p99. |
| GPU utilization | Misma vista → **GPU**. Si T4 satura, considerar A10G o multi-replica. |
| Billing | Dashboard → **Billing**. Cold starts cuestan poco (segundos de T4); el warm time es lo caro. |

### 8.3 Aplicación

- `GET /api/v1/llm/health` — devuelve estado warm/cold/down sin requerir frontend. Útil para health probes externos.
- `audit_logs` table — toda acción admin/student queda registrada. Query directo en `psql` para forensics.
- Panel admin → **Métricas** → tabs A–E para uso del producto. Tab D = safety events.

### 8.4 DPIA / Compliance review

El Agente 12 (Ethics, Privacy & Compliance) recomienda revisión trimestral del DPIA. Triggers obligatorios:

- Cambio en `RETENTION_DAYS` del cron L2 → re-evaluar minimización Art. 4 Ley 1581/2012.
- Nuevo scope de consentimiento → re-evaluar §3 de `DATA_RETENTION_POLICY.md`.
- Nueva tabla con `messages.content`-equivalente (dato sensible) → re-evaluar §1.5 de la política.

---

## 9. Recursos externos

| Recurso | URL |
|---|---|
| Modal docs | https://modal.com/docs |
| Modal status | https://status.modal.com |
| Railway docs | https://docs.railway.com |
| Railway status | https://status.railway.com |
| Repo Mabel-Gemma4 | https://github.com/ZyFalo/Gemma4-Mabel |
| OpenAI Python SDK (lo que usa `OpenAICompatAdapter`) | https://github.com/openai/openai-python |
| Alembic docs | https://alembic.sqlalchemy.org/en/latest/ |
| PostgreSQL JSONB ops (operador `?` y `-` que usa el cron) | https://www.postgresql.org/docs/16/functions-json.html |
| Piper TTS voices | https://huggingface.co/rhasspy/piper-voices |

---

## 10. Drift / pendientes (DR del runbook)

Lo que sabemos que falta para que el deploy sea production-grade al 100% pero no está en este doc por estar pendiente:

1. **Backups automatizados de Postgres** — Railway tiene snapshots pero el cron de backup periódico requiere plan Pro o un script externo (e.g. `pg_dump` desde un GitHub Action contra Railway). No implementado al 2026-05-24.
2. **Alertas de deploy fallido** — sin webhook configurado. Recomendado: crear webhook Railway → Discord channel del equipo, evento `deployment.failed`.
3. **Health probe externo** — no hay UptimeRobot / Better Uptime apuntando al `/api/v1/health`. Si Railway tiene un incidente prolongado, nadie se entera hasta que un estudiante reporta. Recomendado para el piloto.
4. **Modal GPU monitoring** — no hay alerta cuando la GPU pool no logra crear instances (e.g. T4 sold out en la región). Documentado en backlog del repo `Gemma4-Mabel`.
5. **Rotation policy del `JWT_SECRET`** — no hay calendario. Decisión pendiente: rotar al final del piloto invalidando todas las sesiones, o no rotar hasta post-mortem.
6. **Multi-región** — todo está en una sola región Railway. Si Railway US-East cae, Mabel cae. Aceptable para piloto de 30 estudiantes en Bogotá; revisar para escala.
7. **Volume mount para `UPLOAD_DIR`** — los uploads de ASR viven en el filesystem efímero del container. Cada redeploy los borra. Aceptable porque ASR procesa el audio sincrónicamente y descarta; pero si en el futuro queremos retención de audio para QA, hay que montar un volumen.
8. **CSP / security headers** — FastAPI no aplica Content-Security-Policy. El SPA es simple (sin iframes externos) pero un audit pen-test lo marcará. Backlog Fase 10.
9. **Playwright E2E en CI** — el ADR #8 está vigente pero no instalado. Cada deploy depende de smoke test manual.
10. **Documentación de runbook para incidentes específicos** — este doc cubre el happy path + troubleshooting básico. Incidentes raros (e.g. Postgres replica lag, Modal billing throttle, JWT key rotation con downtime cero) merecen sus propios runbooks cuando ocurran por primera vez.

---

**Última revisión**: 2026-05-24 · Próxima revisión: trimestre Q3 2026 o tras el primer incidente de producción, lo que ocurra primero.
