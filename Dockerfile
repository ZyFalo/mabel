# syntax=docker/dockerfile:1.7

# --------------------------------------------------------------------------
# Stage 1 — Build del frontend con Vite
# --------------------------------------------------------------------------
# Compilamos React/TypeScript a estáticos. `VITE_API_URL=/api/v1` hace que
# axios pegue al mismo host del backend, evitando CORS y removiendo la
# necesidad de un segundo dominio en Railway.
# --------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Capa de deps cacheada — solo se invalida si cambia package*.json
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# El resto del frontend
COPY frontend/ ./

# Build de producción
ENV VITE_API_URL=/api/v1
RUN npm run build

# --------------------------------------------------------------------------
# Stage 2 — Imagen final: Python + FastAPI sirviendo API y SPA
# --------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

# Evita pyc, fuerza unbuffered logging (mejor para Railway logs).
# PYTHONPATH=/app es CRITICO: sin esto, `python scripts/seed_admin.py`
# corre con sys.path[0]=/app/scripts y `from app.core.config import settings`
# rompe con ModuleNotFoundError, abortando el boot antes de uvicorn.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app

WORKDIR /app

# Dependencias del sistema mínimas:
# - libpq necesaria para errores legibles con asyncpg en algunos edge cases.
# - curl útil para healthcheck manual desde Railway shell.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Deps Python — capa cacheada por requirements.txt
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

# Código del backend
COPY backend/ ./

# Estáticos del frontend ya compilados en stage 1 → /app/static/
# El handler SPA en app/main.py busca exactamente esta ruta.
COPY --from=frontend-build /app/frontend/dist ./static

# Modelo de voz español para Piper TTS — se descarga en el build porque
# el .onnx pesa 60MB y NO lo commiteamos al repo (ver .gitignore). El
# código resuelve `PIPER_MODEL_PATH=models/piper/` relativo a WORKDIR
# (/app), así que el destino debe ser /app/models/piper/.
# Si en el futuro queremos varias voces, repetir el bloque o cambiar a
# un script de setup. El hash de la versión esta en setup-piper.sh.
RUN mkdir -p /app/models/piper \
    && curl -fSL -o /app/models/piper/es_ES-mls_9972-low.onnx \
        "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx" \
    && curl -fSL -o /app/models/piper/es_ES-mls_9972-low.onnx.json \
        "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx.json"

EXPOSE 8000

# Boot sequence:
#   1. alembic upgrade head        → aplica migraciones pendientes
#   2. python scripts/seed_admin.py → crea/actualiza admin desde env vars
#   3. uvicorn                     → arranca el servidor
#
# Si cualquiera de los dos primeros falla, el container muere y Railway
# muestra el error en logs; nunca arranca con BD inconsistente.
#
# `exec uvicorn ...` reemplaza al shell como PID 1, asi SIGTERM de
# Railway llega directo a uvicorn y el shutdown es graceful (lifespan
# corre, SSE se cierran limpias, no SIGKILL despues de 30s).
CMD alembic upgrade head \
    && python scripts/seed_admin.py \
    && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
