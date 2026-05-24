# Local Dev Setup — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `899bd44`
> **Audiencia**: dev que clona el repo por primera vez en macOS / Linux y necesita correr Mabel IA localmente con el stack completo (backend + frontend + Postgres + opcionalmente LLM y voz).
> **Tiempo estimado**: 25-40 minutos primera vez (incluye descargas).
> **Para deploy producción**: ver `docs/DEPLOY_RUNBOOK.md`.

---

## Pre-requisitos

| Herramienta | Versión mínima | Cómo verificar |
|---|---|---|
| Python | 3.11.x (recomendado 3.11-slim para coincidir con Docker) | `python3 --version` |
| Node.js | 20.x LTS | `node --version` |
| npm | (viene con Node) | `npm --version` |
| Git | cualquier reciente | `git --version` |
| Docker + Docker Compose | cualquier reciente (para Postgres local) | `docker --version && docker compose version` |
| (opcional) `ffmpeg` | cualquier reciente | `ffmpeg -version` — solo si vas a probar ASR/TTS con audio real |
| (opcional) Modal CLI | última | `modal --version` — solo si tocas el repo del modelo |

**Por qué Python 3.11 y no 3.12+**: el `Dockerfile` usa `python:3.11-slim` por estabilidad de wheels en `faster-whisper`. Usar 3.12 en local funciona casi siempre pero puede divergir del comportamiento de producción.

---

## 1. Clonar el repo y crear `.env`

```bash
git clone <repo-url> Mabel-IA
cd Mabel-IA
cp .env.example .env  # si existe; si no, crear desde cero (ver §2)
```

---

## 2. Variables de entorno mínimas (`.env` en la raíz)

```bash
# Postgres local (Docker Compose lo expone en 5433 con creds del docker-compose.yml)
DATABASE_URL=postgresql+asyncpg://mabel:mabel_dev@localhost:5433/mabel_ia

# JWT — generar uno random (NO usar el de producción)
JWT_SECRET=$(openssl rand -hex 32)

# LLM (default apunta a Gemini OpenAI-compat; OK para desarrollo si tienes API key)
LLM_PROVIDER=openai_compat
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_API_KEY=<tu-gemini-api-key>
LLM_MODEL=gemini-2.5-flash
LLM_FLAVOR=generic
LLM_TIMEOUT_MS=30000

# Admin seed opcional — si no se setean, el seed_admin.py hace skip silencioso
ADMIN_EMAIL=admin@local.dev
ADMIN_PASSWORD=Admin123!
```

**Para usar Mabel-Gemma4 vía Modal localmente**: cambiar `LLM_FLAVOR=mabel_gemma4`, `LLM_BASE_URL=https://<modal-url>/v1`, y `LLM_API_KEY=<modal-token>`. Cold start de 60-90s aplica.

**Para correr sin LLM**: dejar `LLM_API_KEY` vacío. El backend arranca pero los endpoints de chat devolverán 5xx hasta configurar.

---

## 3. Levantar Postgres local

```bash
docker compose up -d        # arranca postgres:16 en puerto 5433
docker compose ps           # debe mostrar el container running
```

Si tienes otro Postgres en 5433, edita `docker-compose.yml` para usar otro puerto y ajusta `DATABASE_URL`.

---

## 4. Backend (FastAPI)

### 4.1 Entorno virtual + dependencias

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4.2 Aplicar migraciones

```bash
alembic upgrade head      # debe terminar con "OK"
# Verificar:
psql "$DATABASE_URL" -c "\dt"   # 15 tablas si todo bien
```

### 4.3 (Opcional) Seed admin

```bash
python -m scripts.seed_admin
# imprime: [seed_admin] created admin admin@local.dev
```

### 4.4 Arrancar servidor

```bash
uvicorn app.main:app --reload --port 8000
# Server corre en http://localhost:8000
# Docs OpenAPI en http://localhost:8000/docs
# Health: http://localhost:8000/api/v1/health
```

### 4.5 Verificación rápida

```bash
curl -s http://localhost:8000/api/v1/health | jq
# {"status":"ok"}
```

---

## 5. Frontend (React + Vite)

### 5.1 Dependencias

```bash
cd frontend
npm ci
```

### 5.2 Dev server

```bash
npm run dev
# Vite arranca en http://localhost:5173
# Proxy automático a /api/* → http://localhost:8000
```

### 5.3 Verificación

Abrir `http://localhost:5173`. Si el backend está arriba, la landing carga; si vas a `/login` puedes autenticarte con el admin seeded.

---

## 6. (Opcional) Voz: Piper TTS

El backend en local descarga el modelo Piper lazy al primer `GET /api/v1/tts/synthesize`. Si quieres tenerlo pre-cargado (ahorra ~60MB de download en el primer request):

```bash
# Desde la raíz del repo
bash scripts/setup-piper.sh
# Descarga es_ES-mls_9972-low.onnx (+ .onnx.json) a models/piper/
```

ASR (faster-whisper) descarga el modelo `base` lazy también. No requiere setup separado.

---

## 7. (Opcional) Cron L2 — probar el script localmente

```bash
cd backend
source .venv/bin/activate
python -m scripts.redact_old_message_ids
# [redact_message_ids] redacted message_id from 0 safety_events older than 30 days
```

Para probar con data: seed 6 safety_events sembrados (4 viejos + 2 recientes) — ver `docs/DATA_RETENTION_POLICY.md` §10 (smoke test inline).

---

## 8. Comandos de mantenimiento

```bash
# Backend lint + format
cd backend && ruff check . && ruff format .

# Frontend lint + format
cd frontend && npx eslint . && npx prettier --check .

# TypeScript check (sin build)
cd frontend && npx tsc --noEmit

# Build frontend producción (solo verificar que no rompe)
cd frontend && npm run build
# Output en frontend/dist/ — esto es lo que el Dockerfile copia a /app/static
```

---

## 9. Crear una nueva migración

```bash
cd backend && source .venv/bin/activate
# 1. Editar el modelo SQLAlchemy en backend/app/models/
# 2. Generar la migración
alembic revision --autogenerate -m "descripcion_corta_en_ingles"
# 3. Revisar el archivo generado en backend/alembic/versions/ — autogenerate falla con:
#    - índices parciales (los crea manualmente)
#    - cambios de CHECK constraints
#    - cambios solo de docstring/server_default sin tipo
# 4. Aplicar
alembic upgrade head
# 5. Si quieres bajar:
alembic downgrade -1
```

---

## 10. Troubleshooting frecuente

| Síntoma | Causa | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'app'` al correr scripts | `PYTHONPATH` no setea cwd | usar `python -m scripts.<name>` (no `python scripts/<name>.py`) — el `-m` agrega cwd a sys.path |
| `pg_isready` not found | no instalado | `brew install libpq` (macOS) o `apt install postgresql-client` (Linux) |
| `psycopg2` / `asyncpg` build fail | falta libpq dev | `brew install libpq postgresql` |
| Vite dev server muestra HTML pero la API da CORS error | dev server no proxa | verificar `vite.config.ts` tiene proxy `/api → http://localhost:8000` |
| `JWT_SECRET no está configurado` al iniciar uvicorn | `.env` mal cargado | verificar que ejecutas desde `backend/` con el venv activo; ver `app/core/config.py:6` (resolución del `.env`) |
| `Address already in use` puerto 8000 | otro proceso | `lsof -ti :8000 | xargs kill -9` o cambia `--port` |
| Postgres en docker no arranca | puerto 5433 ocupado | editar `docker-compose.yml` |
| `make_interval` falla en cron | versión vieja de Postgres | requiere PG 13+; el `docker-compose.yml` usa 16 ✓ |

---

## 11. Editor / IDE

Recomendado VS Code con extensiones:
- **Python** + **Pylance**
- **Ruff** (integrado con el formatter)
- **ESLint** + **Prettier**
- **Tailwind CSS IntelliSense**

`.vscode/settings.json` no está commiteado para no imponer configuración personal; configura tú localmente.

---

## 12. Conexión a datos en local — interfaz GUI

| Herramienta | Conexión |
|---|---|
| **psql CLI** | `psql -h localhost -p 5433 -U mabel mabel_ia` (password `mabel_dev`, definido en `docker-compose.yml`) |
| **DBeaver / TablePlus** | Host=localhost · Port=5433 · DB=mabel_ia · User=mabel · Password=mabel_dev |
| **`/docs` de FastAPI** | http://localhost:8000/docs — Swagger UI interactivo |

---

## Referencias

- Estructura completa del proyecto: `CLAUDE.md`
- Stack completo: `docs/TECH_STACK.md`
- Schema BD: `docs/DB_SCHEMA.md`
- API: `docs/API_REFERENCE.md`
- Deploy producción: `docs/DEPLOY_RUNBOOK.md`
- Política de retención (cron L2): `docs/DATA_RETENTION_POLICY.md`
