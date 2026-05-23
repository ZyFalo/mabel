# Mabel IA

> Asistente virtual de psicoeducacion en salud mental para estudiantes de la Universidad Manuela Beltran (UMB), Bogota, Colombia.

Proyecto de tesis de grado — Ingenieria de Software, 2026. Estudio cuasiexperimental (pretest-posttest) con 30 estudiantes.

## Tech Stack

### Backend
- Python 3.11+ / FastAPI (async)
- SQLAlchemy 2.0 (async + asyncpg)
- PostgreSQL 16 (unico motor dev/prod)
- Alembic (migraciones)
- Google Gemini 2.5 Flash (LLM, adapter pattern)
- faster-whisper (ASR — reconocimiento de voz)
- Piper TTS (sintesis de voz)
- PyJWT + bcrypt (autenticacion)

### Frontend
- React 18 + TypeScript
- Vite
- TailwindCSS v4
- Zustand (state management)
- React Router v6
- Axios

### Infraestructura
- Monorepo (`backend/` + `frontend/`)
- Docker Compose (PostgreSQL 16)
- GitHub Actions (CI/CD)

## Requisitos Previos

- Python 3.11+
- Node.js 20+
- PostgreSQL 16 (local o via Docker)
- npm

## Instalacion

```bash
# 1. Clonar
git clone https://github.com/ZyFalo/mabel.git
cd mabel

# 2. Entorno virtual Python
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# 3. Variables de entorno
cp .env.example .env
# Editar .env con valores reales (DATABASE_URL, JWT_SECRET, GEMINI_API_KEY)

# 4. Base de datos PostgreSQL
# Opcion A: Docker
docker compose up -d

# Opcion B: PostgreSQL local
createdb mabel_ia

# 5. Migraciones
cd backend
alembic upgrade head
cd ..

# 6. Frontend
cd frontend
npm install
cd ..

# 7. Piper TTS (opcional — para sintesis de voz)
bash scripts/setup-piper.sh
```

## Ejecucion

### Backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

API disponible en `http://localhost:8000/api/v1/health`

### Frontend

```bash
cd frontend
npm run dev
```

App disponible en `http://localhost:5173`

### Docker Compose (PostgreSQL)

```bash
docker compose up -d    # Inicia PostgreSQL en puerto 5433
docker compose down     # Detiene
```

## Variables de Entorno

| Variable | Descripcion | Default |
|----------|-------------|---------|
| `DATABASE_URL` | URL de conexion PostgreSQL (asyncpg) | — |
| `JWT_SECRET` | Secreto para firmar tokens JWT | — |
| `GEMINI_API_KEY` | API key de Google Gemini | — |
| `GEMINI_MODEL` | Modelo de Gemini | `gemini-2.5-flash` |
| `GEMINI_TIMEOUT_MS` | Timeout para llamadas a Gemini | `30000` |
| `CORS_ORIGINS` | Origenes CORS permitidos | `http://localhost:5173` |
| `WHISPER_MODEL` | Modelo faster-whisper (ASR) | `base` |
| `PIPER_VOICE` | Voz por defecto de Piper TTS | `es_ES-mls_9972-low` |
| `PIPER_MODEL_PATH` | Ruta a modelos Piper | `models/piper/` |
| `UPLOAD_DIR` | Directorio para audio subido | `uploads/audio/` |

## Estructura del Proyecto

```
Mabel-IA/
├── backend/
│   ├── app/
│   │   ├── core/          # Config, database
│   │   ├── middleware/     # Auth (JWT), guardrails
│   │   ├── models/         # SQLAlchemy models (13 tablas)
│   │   ├── repositories/   # Data access layer
│   │   ├── routers/        # FastAPI endpoints
│   │   ├── schemas/        # Pydantic DTOs
│   │   ├── services/       # Business logic
│   │   │   └── llm/        # LLM abstraction (adapter pattern)
│   │   └── main.py
│   ├── alembic/            # Migraciones
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/            # Axios client
│   │   ├── components/     # UI components
│   │   ├── guards/         # Route guards (auth, consent, onboarding)
│   │   ├── hooks/          # Custom hooks (audio, TTS, subtitles)
│   │   ├── pages/          # Page components
│   │   └── stores/         # Zustand stores
│   └── package.json
├── db/
│   └── schema_postgresql.sql  # DDL (13 tablas, 102 columnas)
├── scripts/
│   └── setup-piper.sh        # Setup Piper TTS + modelo espanol
├── docker-compose.yml
├── .env.example
└── CLAUDE.md
```

## API Endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| **Auth** | | |
| POST | `/api/v1/register` | Registro de usuario |
| POST | `/api/v1/login` | Login (JWT) |
| POST | `/api/v1/forgot-password` | Solicitar reset de contrasena |
| GET | `/api/v1/reset-password/:token` | Validar token de reset |
| POST | `/api/v1/reset-password` | Ejecutar reset |
| PUT | `/api/v1/change-password` | Cambiar contrasena |
| **Consent** | | |
| GET | `/api/v1/consent-versions/active` | Version activa del consentimiento |
| POST | `/api/v1/consents` | Aceptar consentimiento |
| PATCH | `/api/v1/consents/current` | Revocar/reducir scope |
| GET | `/api/v1/users/me/consent-status` | Estado del consentimiento |
| **Users** | | |
| GET | `/api/v1/users/me` | Perfil del usuario |
| DELETE | `/api/v1/users/me` | Eliminar cuenta (hard delete) |
| GET | `/api/v1/users/me/export` | Exportar datos (ARCO) |
| **Preferences** | | |
| GET | `/api/v1/preferences/me` | Obtener preferencias |
| PUT | `/api/v1/preferences` | Crear/actualizar preferencias |
| **Sessions** | | |
| POST | `/api/v1/sessions` | Crear sesion de chat |
| GET | `/api/v1/sessions` | Listar sesiones |
| GET | `/api/v1/sessions/:id` | Detalle de sesion |
| PATCH | `/api/v1/sessions/:id` | Check-in o finalizar sesion |
| **Messages** | | |
| POST | `/api/v1/sessions/:id/messages` | Enviar mensaje (SSE stream) |
| GET | `/api/v1/sessions/:id/messages` | Listar mensajes |
| **Reports** | | |
| POST | `/api/v1/messages/:id/reports` | Reportar mensaje |
| GET | `/api/v1/messages/:id/reports/check` | Verificar si ya reporto |
| **Safety** | | |
| POST | `/api/v1/safety-events` | Crear evento de seguridad |
| GET | `/api/v1/sos` | Config SOS (lineas de ayuda) |
| **Voice** | | |
| POST | `/api/v1/asr/transcribe` | Transcribir audio (ASR) |
| GET | `/api/v1/tts/synthesize` | Sintetizar voz (TTS) |
| **Health** | | |
| GET | `/api/v1/health` | Health check |

## Base de Datos

PostgreSQL 16 — 13 tablas, 102 columnas, 16 FK, 13 CHECK constraints, 20 indices, 7 UNIQUE constraints.

| Tabla | Columnas | Proposito |
|-------|----------|-----------|
| `users` | 9 | Autenticacion, roles (student/admin) |
| `consent_versions` | 8 | Versiones del consentimiento (Ley 1581/2012) |
| `consents` | 6 | Aceptacion/revocacion de consentimiento |
| `preferences` | 7 | Historial, idioma, TTS, accesibilidad |
| `sessions` | 9 | Sesiones de chat con check-in |
| `messages` | 11 | Mensajes (user/assistant/system) |
| `message_reports` | 9 | Reportes de calidad por estudiantes |
| `attachments` | 6 | Audio/imagen/doc adjuntos a mensajes |
| `safety_events` | 7 | Eventos de seguridad y triaje |
| `password_reset_tokens` | 6 | Tokens de reset de contrasena |
| `audit_logs` | 8 | Log inmutable de acciones admin |
| `survey_responses` | 9 | Instrumentos de investigacion (SUS, empathy) |
| `system_config` | 6 | Configuracion operativa (SOS, guardrails) |

DDL completo: `db/schema_postgresql.sql`

## Estado del Desarrollo

| Fase | Descripcion | Estado |
|------|-------------|--------|
| 1 | Infraestructura + BD | Completada |
| 2 | Auth + Consentimiento | Completada |
| 3 | Chat Core + Gemini | Completada |
| 4 | Guardrails + SOS | Completada |
| 5 | Preferencias + Historial + Legal | Completada |
| 6 | Check-in + Reportes | Completada |
| 7 | Voz ASR/TTS | Completada |
| 8 | Panel Admin | Pendiente |
| 9 | Avatar 3D + Lip Sync | Pendiente |
| 10 | Testing + QA + Despliegue | Pendiente |

**Hito pilotable (Fases 1-7):** Alcanzado. Listo para estudio cuasiexperimental con 30 estudiantes.

## Criterios de Exito

- SUS usabilidad >= 70
- Mejora de bienestar percibido con effect size >= 0.3
- Mediana de latencia <= 20s
- 0 violaciones criticas de guardrails
- Tono empatico >= 4/5 en >= 80% de casos

## Cumplimiento Legal

- **Ley 1581/2012 + Decreto 1377/2013:** Proteccion de datos, consentimiento informado
- **Ley 1616/2013 + Ley 2460/2025:** Salud mental como derecho fundamental
- **Resolucion 8430/1993:** Clasificacion de riesgo minimo en investigacion
- **Ley 1419/2010 + Resolucion 2654/2019:** Telesalud / teleorientacion

## Licencia

Proyecto academico — Universidad Manuela Beltran, Bogota, Colombia, 2026.

## Equipo

Tesis de grado de Ingenieria de Software. Equipo de 3 estudiantes con soporte de 15 agentes de IA especializados (Claude Code).
