## Context

Mabel IA está en fase de pre-desarrollo con documentación exhaustiva completada: 13 tablas PostgreSQL definidas en DDL (`db/schema_postgresql.sql`, 274 líneas), 42 interfaces especificadas, 14 ADRs, y 42 mockups. No existe código de producción. El desarrollador tiene PostgreSQL 16 corriendo localmente en `localhost:5432` (user: williampena). Se necesita establecer la estructura de código y conectar la BD antes de implementar cualquier funcionalidad.

**Constraints:**
- PostgreSQL 16 local (no Docker para BD en desarrollo — Docker Compose disponible como alternativa)
- Monorepo: `backend/` (Python/FastAPI) + `frontend/` (React/Vite) en el mismo repositorio
- Remote Git: `https://github.com/ZyFalo/mabel.git`
- El DDL source of truth es `db/schema_postgresql.sql` — los modelos SQLAlchemy DEBEN reflejar exactamente este esquema
- Async SQLAlchemy con asyncpg para rendimiento

## Goals / Non-Goals

**Goals:**
- Repositorio Git monorepo funcional con estructura de carpetas profesional
- Modelos SQLAlchemy para las 13 tablas que reflejen 100% el DDL existente
- Alembic configurado con migración inicial aplicable a PostgreSQL local
- Backend FastAPI arrancable con health check endpoint (`GET /api/v1/health`)
- Frontend React + Vite arrancable con página placeholder
- Linters configurados (Ruff para Python, ESLint + Prettier para JS)
- `.env` con variables de infraestructura y `.env.example` sin secretos

**Non-Goals:**
- Endpoints funcionales (auth, chat, etc.) — eso es Fase 2
- Componentes React funcionales — eso es Fase 2+
- CI/CD (GitHub Actions) — eso es fase posterior
- Docker como entorno principal de desarrollo (el usuario ya tiene PostgreSQL local)
- Seeds de datos — eso es fase posterior
- Tests — se agregan cuando haya lógica que testear

## Decisions

### D1: Async SQLAlchemy + asyncpg
**Decisión:** Usar SQLAlchemy 2.0+ con modo async y asyncpg como driver.
**Alternativas:** SQLAlchemy sync + psycopg2 (más simple pero bloquea el event loop de FastAPI).
**Razón:** FastAPI es async-native. Usar sync SQLAlchemy requeriría wrapping con `run_in_executor` o threads, añadiendo complejidad. asyncpg es el driver async más maduro para PostgreSQL.

### D2: Pydantic Settings para configuración
**Decisión:** Usar `pydantic-settings` para cargar variables de entorno con validación de tipos.
**Alternativas:** python-dotenv directamente (sin validación), dynaconf (más complejo del necesario).
**Razón:** Integración nativa con FastAPI, validación automática de tipos, valores por defecto, y documentación de configuración en un solo lugar.

### D3: Alembic con autogenerate
**Decisión:** Configurar Alembic con `--autogenerate` basado en los modelos SQLAlchemy.
**Alternativas:** Migraciones manuales SQL puro (más control pero más error-prone).
**Razón:** Los modelos SQLAlchemy ya reflejan el DDL. Autogenerate detecta diferencias y genera migraciones automáticamente. Se puede revisar y ajustar antes de aplicar.

### D4: Estructura de carpetas backend por capas
**Decisión:** Organizar backend en capas: `core/` (config, security, database), `models/` (SQLAlchemy), `schemas/` (Pydantic), `repositories/` (data access), `services/` (business logic), `routers/` (endpoints), `middleware/` (guardrails).
**Alternativas:** Organización por feature/módulo (más acoplada, mejor para microservicios).
**Razón:** Coherente con ADR de patrones (Repository + Service layer + Middleware). Separación clara de responsabilidades.

### D5: Base de datos dedicada para Mabel IA
**Decisión:** Crear base de datos `mabel_ia` en PostgreSQL local en vez de usar la base `postgres` default.
**Alternativas:** Usar la base `postgres` directamente (riesgo de conflictos con otros proyectos).
**Razón:** Aislamiento. La extensión pgcrypto y las 13 tablas se crean en un espacio dedicado.

### D6: Frontend scaffolding mínimo
**Decisión:** Crear solo la estructura de carpetas y configuración (Vite, TailwindCSS, Zustand, Router), con un único componente App placeholder. Sin componentes funcionales.
**Alternativas:** Crear todos los componentes vacíos (42 interfaces como stubs).
**Razón:** Los componentes funcionales se implementan en fases posteriores cuando el backend tenga endpoints. Crear stubs vacíos genera ruido.

## Risks / Trade-offs

- **[Incompatibilidad de tipos PostgreSQL ↔ SQLAlchemy]** → Verificar cada columna del DDL contra el modelo SQLAlchemy. Tipos críticos: UUID (pgcrypto), JSONB, TIMESTAMPTZ, TEXT vs VARCHAR. Mitigación: test de migración contra BD real.
- **[Alembic autogenerate no detecta CHECK constraints]** → Algunos CHECK constraints deben agregarse manualmente en la migración. Mitigación: comparar migración generada vs DDL original.
- **[PostgreSQL local vs Docker en CI]** → El desarrollo usa PostgreSQL local, pero CI/CD futuro necesitará Docker. Mitigación: `docker-compose.yml` incluido desde el inicio como alternativa.
- **[Credenciales en .env]** → Riesgo de commit accidental. Mitigación: `.env` en `.gitignore`, `.env.example` sin secretos como referencia.
