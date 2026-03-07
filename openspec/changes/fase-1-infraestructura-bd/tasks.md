## 1. Repositorio Git y estructura monorepo

- [x] 1.1 Crear `.gitignore` (Python + Node.js + `.env` + OS files) — DEBE existir ANTES de cualquier commit para evitar leak de credenciales
- [x] 1.2 Crear `.env.example` con placeholders (`DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/mabel_ia`, JWT_SECRET, GEMINI_API_KEY, GEMINI_MODEL=gemini-2.0-flash, GEMINI_TIMEOUT_MS=30000, CORS_ORIGINS) y `.env` con valores reales (ya excluido por .gitignore)
- [x] 1.3 Inicializar Git (`git init`), hacer primer commit con `.gitignore`, `.env.example` y artefactos de diseño existentes (SIN `.env`)
- [x] 1.4 Conectar remote origin a `https://github.com/ZyFalo/mabel.git` y hacer push inicial
- [x] 1.5 Crear `docker-compose.yml` con servicio PostgreSQL 16 en puerto 5433 (alternativa a BD local)

## 2. Backend scaffold (FastAPI)

- [x] 2.1 Crear estructura de carpetas: `backend/app/{core,models,schemas,repositories,services,routers,middleware}/` con `__init__.py` en cada una
- [x] 2.2 Crear `backend/requirements.txt` con dependencias: fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg, alembic, pydantic-settings, pyjwt, bcrypt, python-dotenv, ruff
- [x] 2.3 Crear `backend/app/core/config.py` con Pydantic Settings (DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_MS, CORS_ORIGINS)
- [x] 2.4 Crear `backend/app/core/database.py` con async engine, async session factory, y dependency `get_db`
- [x] 2.5 Crear `backend/app/main.py` con app FastAPI, CORS middleware, y health check endpoint (`GET /api/v1/health`)
- [x] 2.6 Crear `backend/pyproject.toml` con configuración de Ruff (line-length=120, target py311, rules E/F/I/UP)

## 3. Modelos SQLAlchemy (13 tablas, 102 columnas)

- [x] 3.1 Crear `backend/app/models/base.py` con declarative base, UUID mixin con `gen_random_uuid()`, y convenciones de naming para constraints
- [x] 3.2 Crear `backend/app/models/user.py` — Users (9 cols: id, email, hashed_password, display_name, role, disabled_at, disabled_reason, created_at, deleted_at; 2 CHECK: role, chk_disabled_reason; 1 UNIQUE: email)
- [x] 3.3 Crear `backend/app/models/consent_version.py` — ConsentVersions (8 cols: id, version, title, body, status, published_at, created_by, created_at; 1 CHECK: status; 1 UNIQUE: version; 1 FK: created_by→users SET NULL)
- [x] 3.4 Crear `backend/app/models/consent.py` — Consents (6 cols: id, user_id, scope, accepted_at, revoked_at, consent_version_id; 1 CHECK: scope; 1 UNIQUE: uq_consents_user_version; FK user_id CASCADE, FK consent_version_id RESTRICT)
- [x] 3.5 Crear `backend/app/models/preference.py` — Preferences (7 cols, **user_id como PK** no id separado: user_id, save_history, ui_language, tts_voice, accessibility, checkin_enabled, preferred_chat_mode; 1 CHECK: chat_mode; FK user_id CASCADE)
- [x] 3.6 Crear `backend/app/models/session.py` — Sessions (10 cols: id, user_id, started_at, ended_at, topic_hint, meta, checkin_opt_in, checkin_payload, checkin_completed_at, avatar_used; FK user_id CASCADE)
- [x] 3.7 Crear `backend/app/models/message.py` — Messages (11 cols: id, session_id, role, content, content_sha256, meta, safety_flags, tokens_prompt, tokens_completion, latency_ms, created_at; 1 CHECK: role; FK session_id CASCADE)
- [x] 3.8 Crear `backend/app/models/message_report.py` — MessageReports (9 cols: id, message_id, reporter_id, reason, details, status, severity, created_at, updated_at; 3 CHECK: reason, status, severity; 1 UNIQUE: uq_msg_user; FK message_id CASCADE, FK reporter_id CASCADE)
- [x] 3.9 Crear `backend/app/models/attachment.py` — Attachments (6 cols: id, message_id, kind, path, meta, created_at; 1 CHECK: kind IN 'audio','image','doc'; FK message_id CASCADE)
- [x] 3.10 Crear `backend/app/models/safety_event.py` — SafetyEvents (7 cols: id, user_id **nullable**, session_id, event_type **sin CHECK**, payload, status, created_at; 1 CHECK: status; FK user_id SET NULL, FK session_id SET NULL)
- [x] 3.11 Crear `backend/app/models/password_reset_token.py` — PasswordResetTokens (6 cols: id, user_id, token_hash, expires_at, used_at, created_at; 1 UNIQUE: token_hash; FK user_id CASCADE)
- [x] 3.12 Crear `backend/app/models/audit_log.py` — AuditLogs (8 cols: id, admin_id, action, target_type, target_id, detail, ip_address, created_at; FK admin_id SET NULL; append-only)
- [x] 3.13 Crear `backend/app/models/survey_response.py` — SurveyResponses (9 cols: id, user_id, instrument, phase, score, raw_data, administered_at, imported_at, imported_by; 2 CHECK: instrument, phase; 1 UNIQUE: uq_survey_user_instrument_phase; FK user_id SET NULL, FK imported_by SET NULL)
- [x] 3.14 Crear `backend/app/models/system_config.py` — SystemConfig (6 cols: key TEXT PK, value, description, updated_by, updated_at, created_at; FK updated_by SET NULL)
- [x] 3.15 Crear `backend/app/models/__init__.py` que importe todos los modelos (necesario para Alembic autogenerate)

## 4. Alembic y migración inicial

- [x] 4.1 Inicializar Alembic en `backend/` con template async (`alembic init -t async alembic`)
- [x] 4.2 Configurar `backend/alembic/env.py` para importar modelos y usar async engine desde config
- [x] 4.3 Crear script `backend/scripts/create_db.py` para crear base de datos `mabel_ia` y habilitar pgcrypto
- [x] 4.4 Ejecutar script de creación de BD: crear `mabel_ia` en PostgreSQL local
- [x] 4.5 Generar migración inicial con `alembic revision --autogenerate -m "initial_schema_13_tables"`
- [x] 4.6 Revisar migración generada: verificar 13 tablas, 102 columnas, 13 CHECK constraints, 16 FK (8 CASCADE + 7 SET NULL + 1 RESTRICT), 20 índices explícitos (4 parciales + 1 UNIQUE parcial), 7 UNIQUE. Ajustar manualmente lo que autogenerate no capture (especialmente CHECK constraints y partial indices)
- [ ] 4.7 Aplicar migración: `alembic upgrade head` contra BD local
- [x] 4.8 Verificar que las 13 tablas existen en `mabel_ia` con constraints correctos

## 5. Frontend scaffold (React + Vite)

- [x] 5.1 Crear proyecto React con Vite: `npm create vite@latest frontend -- --template react` en el root del repo
- [x] 5.2 Instalar dependencias: tailwindcss, postcss, autoprefixer, zustand, react-router-dom, axios
- [x] 5.3 Configurar TailwindCSS con design tokens del proyecto (primary #A51916, accent #0F303A, danger #DC2626, success #16A34A, warning #F59E0B)
- [x] 5.4 Crear estructura de carpetas: `frontend/src/{components,pages,stores,services,assets}/`
- [x] 5.5 Crear componente App placeholder: "Mabel IA — En construcción" con colores del design system
- [x] 5.6 Configurar ESLint + Prettier con reglas para React/JSX
- [x] 5.7 Verificar que `npm run dev` arranca correctamente en puerto 5173

## 6. Verificación final

- [x] 6.1 Verificar backend arranca: `uvicorn app.main:app --reload` responde en `GET /api/v1/health`
- [x] 6.2 Verificar frontend arranca: `npm run dev` muestra placeholder
- [x] 6.3 Verificar linters: `ruff check backend/` y `npm run lint` pasan sin errores
- [x] 6.4 Verificar BD: 13 tablas, 102 columnas, 16 FK, 13 CHECK, 20 índices, 7 UNIQUE en `mabel_ia`
- [ ] 6.5 Commit final y push a GitHub con mensaje descriptivo
