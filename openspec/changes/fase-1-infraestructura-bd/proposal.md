## Why

Mabel IA es un asistente virtual de psicoeducación en salud mental para estudiantes de la UMB. Actualmente el proyecto tiene documentación exhaustiva (42 interfaces, 13 tablas BD, 14 ADRs, 42 mockups) pero **cero código de producción**. Esta primera fase establece los cimientos técnicos: repositorio Git, estructura monorepo, esquema de BD con migraciones, y configuración de infraestructura local — sin los cuales ninguna funcionalidad puede implementarse.

## What Changes

- Inicializar repositorio Git monorepo con estructura `backend/` + `frontend/` + archivos de configuración
- Conectar con remote `https://github.com/ZyFalo/mabel.git`
- Crear proyecto FastAPI con estructura de carpetas (routers, services, repositories, models, schemas, middleware, core)
- Crear proyecto React + Vite con estructura básica (scaffolding mínimo, sin funcionalidad aún)
- Implementar modelos SQLAlchemy para las 13 tablas del esquema BD (102 columnas, 16 FK, 13 CHECK, 20 índices, 7 UNIQUE)
- Configurar Alembic para migraciones incrementales contra PostgreSQL 16 local
- Crear archivo `.env` con variables de infraestructura (DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, GEMINI_MODEL, CORS_ORIGINS)
- Crear `docker-compose.yml` para orquestación futura de servicios (PostgreSQL ya corre localmente)
- Configurar linters: Ruff (Python), ESLint + Prettier (JS/React)
- Crear `.gitignore` apropiado para Python + Node.js + .env
- Aplicar migración inicial que crea las 13 tablas en PostgreSQL local

## Capabilities

### New Capabilities
- `project-scaffold`: Estructura monorepo Git, `.gitignore`, `.env.example`, configuración de linters, `docker-compose.yml`
- `database-models`: Modelos SQLAlchemy para 13 tablas (users, consent_versions, consents, preferences, sessions, messages, message_reports, attachments, safety_events, password_reset_tokens, audit_logs, survey_responses, system_config) con todos los constraints, índices y relaciones
- `database-migrations`: Configuración de Alembic con migración inicial que crea el esquema completo en PostgreSQL 16
- `backend-scaffold`: Proyecto FastAPI con estructura de carpetas, configuración Pydantic Settings, extensión pgcrypto, health check endpoint
- `frontend-scaffold`: Proyecto React 18 + Vite + TailwindCSS + Zustand (scaffolding mínimo, sin componentes funcionales)

### Modified Capabilities

(Ninguna — este es el primer change del proyecto, no hay capabilities existentes)

## Impact

- **Código:** Se crea toda la estructura del repositorio desde cero (~30-40 archivos)
- **BD:** Se crea esquema completo de 13 tablas en PostgreSQL local (localhost:5432)
- **Dependencias Python:** FastAPI, SQLAlchemy, Alembic, Pydantic, Uvicorn, asyncpg, PyJWT, bcrypt, python-dotenv, Ruff
- **Dependencias Node:** React 18, Vite, TailwindCSS, Zustand, React Router, ESLint, Prettier
- **Git:** Primer commit con artefactos de diseño existentes + código scaffold
- **CI/CD:** Aún no (se implementará en fases posteriores)
