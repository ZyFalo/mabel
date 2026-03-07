# FASE 2 -- Validacion de Compatibilidad Backend para Evolucion 004

> **Proyecto:** Mabel IA -- Asistente de Psicoeducacion para Salud Mental Estudiantil UMB
> **Agente:** 04 -- Backend Developer
> **Fecha:** 2026-02-22
> **Fase:** 2 -- Validacion de compatibilidad con FastAPI / SQLAlchemy 2.0 / Alembic / Pydantic
> **Fuentes consultadas:**
> - DDL actual: `db/schema_postgresql.sql` (215 lineas, 11 tablas, Evolucion 003)
> - Reporte de validacion: `docs/REPORTE_VALIDACION_BD_INTERFACES.md` (Fase 4, Arbitro Agente 02)
> - Evaluacion Fase 3 previa: `docs/FASE3_EVALUACION_CAPA_APLICACION.md` (Agente 04)
> - Context7 MCP: SQLAlchemy (`/websites/sqlalchemy_en_21`) -- mapped_column, UUID, CASCADE/RESTRICT, CheckConstraint, relationship cascades
> - Context7 MCP: FastAPI (`/websites/fastapi_tiangolo`) -- dependency injection, async session, middleware patterns

---

# NOTA SOBRE VARIANTES DE DISENO

La propuesta sometida a evaluacion en este documento presenta **variantes respecto al DDL aprobado** en `REPORTE_VALIDACION_BD_INTERFACES.md`. Las diferencias clave son:

| Aspecto | DDL aprobado (Reporte) | Variante evaluada (esta Fase 2) |
|---------|----------------------|-------------------------------|
| `consent_versions.status` | `is_active BOOLEAN` + indice unico parcial `WHERE is_active = true` | `status CHECK ('draft','active','archived')` + indice parcial `WHERE status = 'active'` |
| `consent_versions.published_at` | No existe | `TIMESTAMP` nueva columna |
| `consent_versions.title` | No existe (solo body_text) | `TEXT` nueva columna |
| `consents.consent_version_id` | No existe (acoplamiento suave via TEXT) | `UUID FK -> consent_versions(id) ON DELETE RESTRICT` |
| `system_config.id` | PK es `key TEXT` | PK es `UUID` + `key TEXT UNIQUE` |
| `system_config.description` | No existe | `TEXT` nueva columna |
| `system_config.created_at` | No existe | `TIMESTAMP` nueva columna |

Este reporte evalua la **variante propuesta**, no el DDL aprobado. Donde las variantes introducen diferencias significativas, se senalan con recomendaciones.

---

# Seccion A: Compatibilidad SQLAlchemy 2.0

---

## A.1 Tipos de datos propuestos

| Tipo PostgreSQL | Tipo SQLAlchemy 2.0 | Mapeo directo | Notas |
|----------------|--------------------|--------------:|-------|
| `UUID` | `sqlalchemy.dialects.postgresql.UUID` o `Uuid` (SA 2.0+) | SI | SQLAlchemy 2.0 introduce `Uuid` como tipo generico. Con `mapped_column`, se usa `Mapped[uuid.UUID]` directamente y SQLAlchemy infiere el tipo correcto para PostgreSQL. Verificado en Context7. |
| `TEXT` | `sa.Text()` o `sa.String()` | SI | `Mapped[str]` con `mapped_column()` mapea a `VARCHAR` por defecto; para `TEXT` se usa `mapped_column(Text)`. |
| `JSONB` | `sqlalchemy.dialects.postgresql.JSONB` | SI | Tipo especifico de PostgreSQL, plenamente soportado. Se usa con `Mapped[dict]` o `Mapped[dict | None]`. |
| `TIMESTAMP` | `sa.DateTime()` | SI | `Mapped[datetime.datetime]` mapea directamente. PostgreSQL `TIMESTAMP` = SQLAlchemy `DateTime()`. |
| `INTEGER` | `sa.Integer()` | SI | `Mapped[int]` o `Mapped[int | None]` para nullable. Mapeo nativo. |
| `BOOLEAN` | `sa.Boolean()` | SI | `Mapped[bool]` mapea directamente. |

### Veredicto A.1: APROBADO

Todos los tipos propuestos tienen mapeo directo en SQLAlchemy 2.0. No se requiere conversion, adaptador, ni tipo custom. El uso de `Mapped[]` con type annotations de Python 3.10+ es la forma idiomatica actual confirmada por Context7.

---

## A.2 CHECK constraint `status IN ('draft', 'active', 'archived')`

### Analisis

El DDL actual ya tiene multiples CHECK constraints con el mismo patron:

```sql
-- Existentes en el DDL actual:
CHECK (role IN ('student', 'admin'))                                    -- users
CHECK (scope IN ('solo_uso', 'uso_mejora_anon'))                       -- consents
CHECK (role IN ('system', 'user', 'assistant'))                        -- messages
CHECK (reason IN ('hallucination','harmful','privacy','low_empathy','other'))  -- message_reports
CHECK (kind IN ('audio', 'image', 'doc'))                              -- attachments
CHECK (status IN ('active', 'reviewed', 'resolved'))                   -- safety_events
CHECK (preferred_chat_mode IN ('chat', 'avatar'))                      -- preferences
```

En SQLAlchemy 2.0, el patron se implementa de dos formas equivalentes:

**Opcion 1: CheckConstraint explicito (patron actual del proyecto)**

```python
from sqlalchemy import CheckConstraint

class ConsentVersion(Base):
    __tablename__ = "consent_versions"

    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="draft"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'active', 'archived')",
            name="chk_consent_versions_status"
        ),
    )
```

**Opcion 2: Enum de PostgreSQL**

```python
from sqlalchemy.dialects.postgresql import ENUM

consent_status_enum = ENUM('draft', 'active', 'archived', name='consent_status', create_type=True)

class ConsentVersion(Base):
    status: Mapped[str] = mapped_column(consent_status_enum, nullable=False, server_default="draft")
```

### Recomendacion

Usar **CheckConstraint** (Opcion 1) por consistencia con el DDL existente. Todos los constraints del esquema actual usan `CHECK (col IN (...))`, no `ENUM`. Introducir un `ENUM` tipo solo para esta tabla romperia la uniformidad y agregaria complejidad de migracion (los ENUM de PostgreSQL requieren `ALTER TYPE` para agregar valores, lo cual es mas rigido que modificar un CHECK).

### Veredicto A.2: APROBADO

El CHECK constraint `status IN ('draft', 'active', 'archived')` se implementa exactamente igual que los CHECK existentes. Sin objeciones.

---

## A.3 ON DELETE RESTRICT en `consent_version_id` vs CASCADE en `user_id`

### Contexto

La variante propuesta agrega a la tabla `consents`:

```sql
consent_version_id UUID REFERENCES consent_versions(id) ON DELETE RESTRICT
```

La tabla `consents` ya tiene:

```sql
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
```

### Pregunta critica: Si se ejecuta `DELETE FROM users WHERE id = :uid`, CASCADE borra las filas de `consents`. RESTRICT en `consent_version_id` bloquea este CASCADE?

### Respuesta: NO. RESTRICT no interfiere.

La semantica de PostgreSQL es:

1. `ON DELETE CASCADE` en `consents.user_id`: cuando se borra una fila de `users`, PostgreSQL automaticamente borra las filas de `consents` que la referencian.

2. `ON DELETE RESTRICT` en `consents.consent_version_id`: **solo se activa cuando se intenta borrar una fila de `consent_versions`**. RESTRICT impide el DELETE de la fila **referenciada** (en `consent_versions`), no de la fila que **contiene** la FK (en `consents`).

3. Cuando CASCADE borra una fila de `consents`, esa fila deja de existir. Su FK `consent_version_id` desaparece con ella. La fila en `consent_versions` queda intacta.

**Flujo de eliminacion de cuenta:**

```
DELETE FROM users WHERE id = :uid
  |
  +-- CASCADE -> DELETE FROM consents WHERE user_id = :uid
  |     |
  |     +-- La fila de consents se BORRA (incluida su FK consent_version_id)
  |     +-- consent_versions NO se ve afectada (nadie intento borrar de consent_versions)
  |
  +-- CASCADE -> DELETE FROM preferences WHERE user_id = :uid
  +-- CASCADE -> DELETE FROM sessions WHERE user_id = :uid
  +-- ... (demas tablas con CASCADE)
```

**Escenario donde RESTRICT SI se activa:**

```
DELETE FROM consent_versions WHERE id = :version_id
  |
  +-- RESTRICT: Si alguna fila en consents tiene consent_version_id = :version_id
  |             -> ERROR: update or delete on table "consent_versions" violates
  |                       foreign key constraint on table "consents"
  |
  +-- Este es el comportamiento DESEADO: no permitir borrar una version de
      consentimiento que algun usuario ya acepto.
```

### Verificacion con SQLAlchemy

En SQLAlchemy 2.0, la combinacion se define asi:

```python
class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # CASCADE: si se borra el usuario, se borran sus consentimientos
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # RESTRICT: no permitir borrar una version de consentimiento que alguien referencie
    consent_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("consent_versions.id", ondelete="RESTRICT"), nullable=True
    )
```

Context7 confirma que `ondelete="RESTRICT"` es un parametro valido de `ForeignKey()` y se emite directamente en el DDL generado. SQLAlchemy no necesita logica adicional para manejar esta combinacion; la semantica es 100% del motor PostgreSQL.

### Veredicto A.3: APROBADO

CASCADE en `user_id` y RESTRICT en `consent_version_id` son **independientes y compatibles**. CASCADE borra la fila de `consents` (eliminando la FK). RESTRICT solo actua si se intenta borrar la fila en `consent_versions`. No hay conflicto.

---

## A.4 Observacion sobre la variante `consent_version_id` vs DDL aprobado

El DDL aprobado por el Arbitro (Agente 02) en la Seccion 9(b) del reporte decidio **NO agregar FK** desde `consents` hacia `consent_versions`, manteniendo "acoplamiento suave" via `consents.version TEXT`. Los argumentos fueron:

1. Registros historicos en `consents` no tendrian `consent_versions` correspondiente (violaria FK).
2. FK sobre TEXT es fragil.
3. La correlacion se hace en la capa de aplicacion.

La variante propuesta resuelve parcialmente estos problemas:
- Usa `consent_version_id UUID` (no TEXT), eliminando la fragilidad de FK sobre TEXT.
- Permite `NULL` para registros historicos, evitando la violacion de FK.

**Evaluacion del Backend:**

| Criterio | FK directa (variante) | Acoplamiento suave (aprobado) |
|---------- |----------------------|-------------------------------|
| Integridad referencial | Garantizada por PostgreSQL | Depende de validacion en app |
| Registros historicos | NULL (resuelto) | Sin problema (no hay FK) |
| Complejidad de migracion | Backfill necesario si hay datos previos | Ninguna |
| Seguridad de datos | Mayor (el motor previene inconsistencias) | Menor (un bug puede crear inconsistencias) |

**Recomendacion del Agente 04:** La variante con `consent_version_id UUID FK` es **preferible** desde la perspectiva del backend. La integridad referencial en el motor es siempre superior a la validacion en la capa de aplicacion. El NULL para registros historicos es un compromiso aceptable. Sin embargo, esta decision debe ser coordinada con el Agente 02 (Arquitecto) ya que contradice el veredicto de la Seccion 9(b).

### Veredicto A.4: APROBADO CON OBSERVACION

La FK es tecnicamenta correcta y compatible. Requiere coordinacion con el Arquitecto para resolver la discrepancia con el veredicto previo.

---

# Seccion B: Repository Pattern

---

## B.1 ConsentVersionRepository

### Operaciones requeridas

```python
class ConsentVersionRepository:
    """Repositorio para gestionar versiones del documento de consentimiento."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def create(self, version: str, title: str, body: str, created_by: uuid.UUID) -> ConsentVersion:
        """Crear nueva version en estado 'draft'."""
        cv = ConsentVersion(
            version=version,
            title=title,
            body_text=body,
            status="draft",
            created_by=created_by,
        )
        self._db.add(cv)
        await self._db.flush()
        return cv

    async def get_by_id(self, id: uuid.UUID) -> ConsentVersion | None:
        """Obtener version por ID."""
        return await self._db.get(ConsentVersion, id)

    async def get_active_version(self) -> ConsentVersion | None:
        """Obtener la unica version con status='active'.

        Usa el indice parcial WHERE status = 'active' para un index-only scan.
        """
        stmt = select(ConsentVersion).where(ConsentVersion.status == "active")
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(self, *, include_archived: bool = False) -> list[ConsentVersion]:
        """Listar todas las versiones, opcionalmente excluyendo archivadas."""
        stmt = select(ConsentVersion).order_by(ConsentVersion.created_at.desc())
        if not include_archived:
            stmt = stmt.where(ConsentVersion.status != "archived")
        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    async def update_status(self, id: uuid.UUID, new_status: str) -> ConsentVersion:
        """Cambiar estado de una version (draft -> active, active -> archived)."""
        cv = await self.get_by_id(id)
        if cv is None:
            raise ValueError(f"ConsentVersion {id} not found")
        cv.status = new_status
        if new_status == "active":
            cv.published_at = datetime.utcnow()
        await self._db.flush()
        return cv
```

### Encaje con repositorios existentes

No hay conflicto. El proyecto actualmente tiene repositorios planeados para cada tabla (UserRepository, ConsentRepository, SessionRepository, etc.). `ConsentVersionRepository` es un nuevo repositorio independiente. Su unica interaccion es con `ConsentRepository` a nivel de servicio (no de repositorio), cuando se necesita correlacionar la version aceptada por el usuario con la version activa del sistema.

### Veredicto B.1: APROBADO

El repositorio encaja perfectamente en el patron existente. Sin conflictos.

---

## B.2 SystemConfigRepository

### Operaciones requeridas

```python
class SystemConfigRepository:
    """Repositorio para configuracion global del sistema (key-value)."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def get(self, key: str) -> Any | None:
        """Obtener valor de una key de configuracion."""
        stmt = select(SystemConfig).where(SystemConfig.key == key)
        result = await self._db.execute(stmt)
        row = result.scalar_one_or_none()
        return row.value if row else None

    async def set(self, key: str, value: Any, admin_id: uuid.UUID) -> SystemConfig:
        """Crear o actualizar una key de configuracion.

        Usa UPSERT (INSERT ... ON CONFLICT DO UPDATE) para atomicidad.
        """
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = pg_insert(SystemConfig).values(
            key=key,
            value=value,
            updated_by=admin_id,
            updated_at=datetime.utcnow(),
        ).on_conflict_do_update(
            index_elements=["key"],
            set_={
                "value": value,
                "updated_by": admin_id,
                "updated_at": datetime.utcnow(),
            }
        )
        await self._db.execute(stmt)
        await self._db.flush()
        return await self.get(key)

    async def get_all(self) -> dict[str, Any]:
        """Obtener todas las configuraciones como diccionario."""
        stmt = select(SystemConfig)
        result = await self._db.execute(stmt)
        return {row.key: row.value for row in result.scalars().all()}
```

### Observacion sobre la variante de PK

La variante propuesta usa `UUID` como PK + `key UNIQUE`. El DDL aprobado usa `key TEXT` como PK directamente. Desde la perspectiva del repositorio, ambas funcionan. Sin embargo:

- Con `key TEXT` como PK: las operaciones `get(key)` y `set(key, ...)` usan directamente el PK. Mas simple.
- Con `UUID` PK + `key UNIQUE`: se necesita buscar por `key` (indice UNIQUE) en vez de por PK. Funciona pero es innecesariamente indirecto.

**Recomendacion:** Mantener `key TEXT` como PK (DDL aprobado). No hay beneficio en agregar un UUID PK a una tabla key-value de <20 filas. El UUID PK introduce complejidad sin beneficio.

### Veredicto B.2: APROBADO CON OBSERVACION

El repositorio encaja en el patron. Recomendacion: mantener `key TEXT` como PK por simplicidad.

---

## B.3 Conflicto con repositorios existentes

| Repositorio nuevo | Interaccion con existentes | Conflicto |
|-------------------|---------------------------|-----------|
| `ConsentVersionRepository` | Leido por `ConsentService` para comparar version activa con la del usuario | Ninguno |
| `SystemConfigRepository` | Leido por `GuardrailMiddleware`, `ChatService` (config LLM), `DashboardService` | Ninguno |

No hay conflicto de responsabilidades. Cada repositorio gestiona una sola tabla. La coordinacion ocurre en la capa de servicios.

### Veredicto B.3: APROBADO

Sin conflictos con repositorios existentes ni planeados.

---

# Seccion C: Service Layer

---

## C.1 ConsentService: Flujo de publicacion atomico

### Flujo propuesto: desactivar anterior -> activar nueva -> audit_log

```python
class ConsentService:
    """Servicio para gestionar versiones de consentimiento."""

    def __init__(
        self,
        consent_version_repo: ConsentVersionRepository,
        audit_repo: AuditLogRepository,
        db: AsyncSession,
    ):
        self._cv_repo = consent_version_repo
        self._audit_repo = audit_repo
        self._db = db

    async def publish_version(self, version_id: uuid.UUID, admin_id: uuid.UUID) -> ConsentVersion:
        """Publicar una version de consentimiento.

        Transaccion atomica:
        1. Archivar la version activa actual (si existe)
        2. Activar la nueva version
        3. Registrar en audit_logs

        Si cualquier paso falla, TODA la operacion se revierte.
        """
        async with self._db.begin():
            # 1. Obtener y archivar version activa actual
            current_active = await self._cv_repo.get_active_version()
            if current_active is not None:
                await self._cv_repo.update_status(current_active.id, "archived")

            # 2. Activar la nueva version
            new_version = await self._cv_repo.update_status(version_id, "active")

            # 3. Registrar en audit_logs
            await self._audit_repo.create(
                admin_id=admin_id,
                action="consent_version_published",
                target_type="consent_versions",
                target_id=version_id,
                detail={
                    "version": new_version.version,
                    "previous_active": str(current_active.id) if current_active else None,
                },
            )

        return new_version
```

### Analisis de atomicidad

La transaccion es atomica gracias a `async with self._db.begin()`. En SQLAlchemy 2.0 con `AsyncSession`:

- `begin()` inicia una transaccion de PostgreSQL.
- Si cualquier operacion dentro del bloque lanza una excepcion, se ejecuta `ROLLBACK` automaticamente.
- Si el bloque termina sin excepcion, se ejecuta `COMMIT`.

Esto garantiza que:
- Nunca habra 0 versiones activas (si activar la nueva falla, la anterior no se archiva).
- Nunca habra 2 versiones activas (si archivar la anterior falla... bueno, el indice unico parcial `WHERE status = 'active'` lo impediria de todas formas a nivel de BD).

**Doble proteccion:** La atomicidad del servicio (transaccion) + el constraint de BD (indice unico parcial) proporcionan defense-in-depth.

### Veredicto C.1: APROBADO

El flujo transaccional es correcto, implementable con `async with session.begin()`, y cuenta con doble proteccion (app + BD).

---

## C.2 ConfigService: Cache en memoria con TTL y async SQLAlchemy

### Pregunta: El patron de cache funciona con async SQLAlchemy?

Si, con una consideracion importante.

```python
import time
from typing import Any


class ConfigService:
    """Servicio de configuracion con cache en memoria y TTL."""

    _cache: dict[str, Any] = {}
    _cache_expires_at: float = 0
    _TTL_SECONDS: int = 60

    def __init__(self, config_repo: SystemConfigRepository):
        self._repo = config_repo

    async def get(self, key: str) -> Any | None:
        """Obtener valor de configuracion, usando cache si no ha expirado."""
        if time.monotonic() > self._cache_expires_at:
            await self._reload_cache()
        return self._cache.get(key)

    async def get_all(self) -> dict[str, Any]:
        """Obtener todas las configuraciones."""
        if time.monotonic() > self._cache_expires_at:
            await self._reload_cache()
        return dict(self._cache)

    async def set(self, key: str, value: Any, admin_id: uuid.UUID) -> None:
        """Actualizar configuracion. Invalida cache inmediatamente."""
        await self._repo.set(key, value, admin_id)
        # Invalidar cache para forzar recarga en la proxima lectura
        self._cache_expires_at = 0

    async def _reload_cache(self) -> None:
        """Recargar todas las configuraciones desde BD."""
        self._cache = await self._repo.get_all()
        self._cache_expires_at = time.monotonic() + self._TTL_SECONDS
```

### Consideraciones de async

1. **Thread safety:** En FastAPI con uvicorn (single process, async), todas las coroutines se ejecutan en un solo thread (event loop). No hay condicion de carrera al acceder a `_cache` y `_cache_expires_at` porque solo un coroutine lee/escribe a la vez entre `await` points.

2. **Posible race condition:** Si dos requests concurrentes llaman a `get()` al mismo tiempo cuando el cache ha expirado, ambas detectaran `time.monotonic() > self._cache_expires_at` y ambas ejecutaran `_reload_cache()`. Esto resulta en 2 queries a BD en vez de 1. Para MVP con 30 usuarios, esto es inocuo. Si se quisiera evitar, se puede usar un `asyncio.Lock()`:

```python
async def _reload_cache(self) -> None:
    async with self._lock:
        # Double-check despues de adquirir el lock
        if time.monotonic() <= self._cache_expires_at:
            return
        self._cache = await self._repo.get_all()
        self._cache_expires_at = time.monotonic() + self._TTL_SECONDS
```

3. **Scope del servicio:** El `ConfigService` debe ser un **singleton** (una sola instancia compartida por todos los requests). En FastAPI, esto se logra con `@lru_cache` en la factory o instanciando en el `lifespan`:

```python
from contextlib import asynccontextmanager

config_service: ConfigService | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global config_service
    # Inicializar con una session dedicada o un session_factory
    config_service = ConfigService(config_repo)
    yield
    config_service = None

def get_config_service() -> ConfigService:
    return config_service
```

**Advertencia importante:** El `ConfigService` singleton no puede mantener una referencia a una `AsyncSession` especifica, porque las sessions de SQLAlchemy no son thread-safe ni reutilizables entre requests. El repositorio debe recibir una session fresca en cada operacion, o el servicio debe usar un `async_sessionmaker` para crear sessions on-demand:

```python
class ConfigService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]):
        self._session_factory = session_factory

    async def _reload_cache(self) -> None:
        async with self._session_factory() as session:
            repo = SystemConfigRepository(session)
            self._cache = await repo.get_all()
            self._cache_expires_at = time.monotonic() + self._TTL_SECONDS
```

### Veredicto C.2: APROBADO CON OBSERVACIONES

El patron de cache funciona con async SQLAlchemy. Observaciones:
1. El servicio debe ser singleton.
2. Usar `async_sessionmaker` para crear sessions on-demand, no reutilizar una session.
3. Para MVP, el double-reload por race condition es aceptable; `asyncio.Lock()` es opcional.

---

## C.3 ChatService: Medicion de latency_ms

### Pregunta: Donde medir `latency_ms`?

La medicion debe ocurrir en el `ChatService`, envolviendo la llamada a `LLMProvider.generate()` con `time.monotonic()`.

```python
import time


class ChatService:
    """Servicio principal de chat."""

    def __init__(
        self,
        llm_provider: LLMProvider,  # Interface/adapter (Gemini o futuro local)
        message_repo: MessageRepository,
        session_repo: SessionRepository,
        pref_repo: PreferenceRepository,
    ):
        self._llm = llm_provider
        self._msg_repo = message_repo
        self._session_repo = session_repo
        self._pref_repo = pref_repo

    async def process_message(
        self,
        session_id: uuid.UUID,
        user_content: str,
        user_id: uuid.UUID,
    ) -> Message:
        """Procesar mensaje del usuario y generar respuesta del LLM.

        Mide latencia con time.monotonic() (reloj monotonico, no afectado
        por ajustes de hora del sistema, precision de microsegundos).
        """
        # 1. Persistir mensaje del usuario
        prefs = await self._pref_repo.get_by_user(user_id)
        user_msg = None
        if prefs.save_history:
            user_msg = await self._msg_repo.create(
                session_id=session_id,
                role="user",
                content=user_content,
            )

        # 2. Construir prompt con historial de la sesion
        prompt_messages = await self._build_prompt(session_id, user_content)

        # 3. Invocar LLM y medir latencia
        start = time.monotonic()
        response = await self._llm.generate(messages=prompt_messages)
        latency_ms = int((time.monotonic() - start) * 1000)

        # 4. Persistir respuesta con latencia
        assistant_msg = None
        if prefs.save_history:
            assistant_msg = await self._msg_repo.create(
                session_id=session_id,
                role="assistant",
                content=response.text,
                latency_ms=latency_ms,
                tokens_prompt=response.prompt_tokens,
                tokens_completion=response.completion_tokens,
                meta={
                    "model": response.model,
                    "temperature": response.temperature,
                },
            )

        return assistant_msg or Message(
            role="assistant",
            content=response.text,
            latency_ms=latency_ms,
        )
```

### Justificacion de `time.monotonic()`

- `time.time()` puede retroceder (ajustes NTP). No apto para medir intervalos.
- `time.monotonic()` es monotonico, no puede retroceder. Precision de microsegundos en Linux/macOS.
- `time.perf_counter()` tiene mayor precision pero incluye tiempo de suspension del sistema. Para latencias de red (>100ms), `monotonic()` es equivalente.
- La conversion `int((end - start) * 1000)` produce milisegundos enteros, compatible con `INTEGER` de PostgreSQL.

### Latencia medida incluye

La latencia capturada con este patron incluye:
- Latencia de red hacia la API de Gemini
- Tiempo de procesamiento/inferencia del modelo
- Serializacion/deserializacion de la respuesta

No incluye:
- Tiempo de pre-filtro de guardrails (se ejecuta antes de `generate()`)
- Tiempo de post-filtro de guardrails (se ejecuta despues)
- Tiempo de persistencia en BD

Esto es correcto. La metrica de "latencia de respuesta del LLM" debe aislar la llamada al proveedor, no el pipeline completo.

### Veredicto C.3: APROBADO

`time.monotonic()` alrededor de `LLMProvider.generate()` es el patron correcto. La latencia se persiste en `messages.latency_ms` como `INTEGER` (milisegundos). Compatible con la capa de abstraccion del LLM (adapter pattern).

---

## C.4 ConsentGuard: 3 estados de consentimiento como middleware FastAPI

### Pregunta: Es implementable como middleware/dependency de FastAPI?

Si. FastAPI soporta dos mecanismos:

1. **Dependency injection** (preferido): una funcion `Depends()` que se inyecta en cada endpoint protegido.
2. **Middleware global** (Starlette): se ejecuta en cada request, incluyendo rutas no protegidas.

**Recomendacion: Usar dependency injection**, no middleware global. Razon: el guard de consentimiento solo aplica a rutas autenticadas de estudiantes, no a rutas publicas (login, registro, landing) ni a rutas de admin. Un middleware global obligaria a tener una lista de exclusiones fragil.

### Implementacion con Dependency Injection

```python
from fastapi import Depends, HTTPException, status


class ConsentStatus:
    """Resultado del guard de consentimiento."""
    VIGENTE = "vigente"
    SCOPE_REDUCIDO = "scope_reducido"
    REVOCADO = "revocado"
    PENDIENTE = "pendiente"


async def require_active_consent(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConsentStatus:
    """Dependency de FastAPI que verifica el estado de consentimiento.

    3 estados posibles:
    - VIGENTE: El usuario tiene consentimiento activo con la version actual
    - SCOPE_REDUCIDO: El usuario tiene consentimiento pero con scope 'solo_uso'
                      (version sigue siendo la activa)
    - REVOCADO: El ultimo consentimiento del usuario tiene revoked_at IS NOT NULL
    - PENDIENTE: No tiene consentimiento o la version no coincide con la activa

    Lanza HTTPException 403 si REVOCADO.
    Redirige al flujo de consentimiento si PENDIENTE.
    Permite acceso con VIGENTE o SCOPE_REDUCIDO.
    """
    cv_repo = ConsentVersionRepository(db)
    consent_repo = ConsentRepository(db)

    # 1. Obtener version activa del sistema
    active_version = await cv_repo.get_active_version()
    if active_version is None:
        # No hay version de consentimiento activa -- error de configuracion
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No hay version de consentimiento activa configurada",
        )

    # 2. Obtener ultimo consentimiento del usuario
    latest_consent = await consent_repo.get_latest_by_user(current_user.id)

    # 3. Evaluar estado
    if latest_consent is None:
        # Nunca acepto consentimiento
        raise HTTPException(
            status_code=status.HTTP_451_UNAVAILABLE_FOR_LEGAL_REASONS,
            detail="Consentimiento pendiente",
            headers={"X-Consent-Required": "true"},
        )

    if latest_consent.revoked_at is not None:
        # Consentimiento revocado total
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Consentimiento revocado",
        )

    # 4. Verificar version
    # Con FK (variante): comparar consent_version_id
    # Con acoplamiento suave (aprobado): comparar version TEXT
    if latest_consent.consent_version_id is not None:
        if latest_consent.consent_version_id != active_version.id:
            raise HTTPException(
                status_code=status.HTTP_451_UNAVAILABLE_FOR_LEGAL_REASONS,
                detail="Nueva version de consentimiento disponible",
                headers={"X-Consent-Required": "true"},
            )
    else:
        # Registro historico sin FK -- comparar por version TEXT
        if latest_consent.version != active_version.version:
            raise HTTPException(
                status_code=status.HTTP_451_UNAVAILABLE_FOR_LEGAL_REASONS,
                detail="Nueva version de consentimiento disponible",
                headers={"X-Consent-Required": "true"},
            )

    # 5. Determinar scope
    if latest_consent.scope == "solo_uso":
        return ConsentStatus.SCOPE_REDUCIDO

    return ConsentStatus.VIGENTE
```

### Uso en endpoints

```python
@router.get("/api/v1/chat/sessions")
async def list_sessions(
    consent: ConsentStatus = Depends(require_active_consent),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """El endpoint solo se ejecuta si el consentimiento es vigente o scope reducido."""
    ...
```

### Evaluacion de los 3 estados

| Estado | Condicion en BD | Accion del guard |
|--------|----------------|------------------|
| **Vigente** | `latest_consent.revoked_at IS NULL` AND `consent_version_id` apunta a version con `status = 'active'` AND `scope = 'uso_mejora_anon'` | Permitir acceso |
| **Scope reducido** | `latest_consent.revoked_at IS NULL` AND `consent_version_id` apunta a version con `status = 'active'` AND `scope = 'solo_uso'` | Permitir acceso (el servicio de chat no persiste mensajes para mejora) |
| **Revocado total** | `latest_consent.revoked_at IS NOT NULL` | HTTP 403 |
| **Pendiente (nueva version)** | `latest_consent.consent_version_id` no coincide con la version activa | HTTP 451 (Legal) |
| **Sin consentimiento** | No existe fila en `consents` para el usuario | HTTP 451 (Legal) |

### Edge cases identificados

1. **Usuario con multiples consents:** El guard siempre consulta el MAS RECIENTE (`ORDER BY accepted_at DESC LIMIT 1`). Esto es correcto: el ultimo consentimiento refleja la decision actual del usuario.

2. **Admin publica nueva version mientras usuario esta en sesion:** El guard verifica en cada request. Si la version cambia, el proximo request del usuario sera rechazado con 451. El frontend debe manejar este HTTP 451 redirigiendo al flujo de consentimiento (#22). No hay riesgo de "servir contenido con version vieja" porque el guard se ejecuta ANTES del handler.

3. **Revocacion parcial seguida de re-aceptacion:** Si el usuario revoca (se pone `revoked_at` en su consent actual) y luego re-acepta (se crea nuevo registro en `consents` con `revoked_at NULL`), el guard tomara el nuevo registro como el mas reciente. Funciona correctamente.

4. **Ventana de cache de ConfigService:** Si se usa cache en el ConsentGuard para la version activa (como sugiere el reporte del Arbitro), hay una ventana de hasta 60 segundos donde un usuario podria seguir usando la version anterior. Para MVP con 30 usuarios y cambios de version extremadamente infrecuentes (1-2 veces en toda la vida del proyecto), esto es aceptable. Si se quiere eliminacion inmediata, no cachear la version activa en el guard.

### Veredicto C.4: APROBADO

La logica de 3 estados es completamente implementable como dependency de FastAPI. La combinacion de columnas propuestas (`revoked_at`, `consent_version_id` o `version`, `scope`) cubre todos los estados. Los edge cases estan controlados.

---

# Seccion D: Flujo de Consentimiento -- 3 Estados

---

## D.1 Evaluacion de cobertura de estados

| Estado | Columnas involucradas | Condicion SQL | Funciona? |
|--------|-----------------------|---------------|-----------|
| **Vigente** | `consents.revoked_at`, `consents.consent_version_id` (o `version`), `consent_versions.status` | `revoked_at IS NULL AND consent_version_id = (SELECT id FROM consent_versions WHERE status = 'active')` | SI |
| **Scope reducido** | `consents.scope` | Vigente + `scope = 'solo_uso'` | SI |
| **Revocado total** | `consents.revoked_at` | `revoked_at IS NOT NULL` en el consent mas reciente | SI |
| **Pendiente (nueva version)** | `consents.consent_version_id`, `consent_versions.status` | `revoked_at IS NULL` AND version no coincide con la activa | SI |

### Veredicto D.1: APROBADO

La combinacion de columnas cubre los 4 estados funcionales sin ambiguedad. Cada estado tiene una condicion SQL distinta y mutuamente excluyente.

---

## D.2 Edge cases del flujo de consentimiento

### Edge case 1: Dos versiones activas simultaneas

**Imposible a nivel de BD** si se usa el indice unico parcial. Con `is_active BOOLEAN`:

```sql
CREATE UNIQUE INDEX uq_consent_versions_active
  ON consent_versions(is_active) WHERE is_active = true;
```

Con `status TEXT CHECK`:

```sql
CREATE UNIQUE INDEX uq_consent_versions_active_status
  ON consent_versions((1)) WHERE status = 'active';
```

**Nota:** El indice parcial con `status = 'active'` requiere una expresion indexable. Se indexa una constante `(1)` con filtro `WHERE status = 'active'`, lo que permite maximo 1 fila con ese status. Esto es equivalente al patron `is_active WHERE is_active = true` del DDL aprobado.

**Alternativa mas limpia para la variante `status`:** Usar un indice unico funcional:

```sql
CREATE UNIQUE INDEX uq_consent_versions_active_status
  ON consent_versions(status) WHERE status = 'active';
```

Esto funciona porque el indice solo admite UN valor `'active'` en la columna `status`.

### Edge case 2: Ninguna version activa

Posible si el admin archiva la version activa sin publicar una nueva. El `ConsentGuard` debe detectar esto y lanzar HTTP 503 (error de configuracion del sistema). Ver pseudocodigo en Seccion C.4.

### Edge case 3: Usuario acepta, luego se elimina la version de su consentimiento

Con `ON DELETE RESTRICT`: **imposible**. PostgreSQL rechaza el DELETE de `consent_versions` si alguna fila en `consents` la referencia.

Sin FK (DDL aprobado): posible. La version podria eliminarse, dejando `consents.version = "1.0"` huerfano. La capa de aplicacion debe validar.

### Edge case 4: Cambio de scope en el mismo consent vs nuevo registro

El flujo actual de #17 (Opcion 1: bajar scope) podria implementarse de dos formas:
- **UPDATE** del registro existente (cambiar `scope` de `uso_mejora_anon` a `solo_uso`).
- **INSERT** de nuevo registro con el nuevo scope.

**Recomendacion:** INSERT de nuevo registro. Esto preserva el historial completo de decisiones del usuario (auditabilidad, Ley 1581/2012) y es consistente con el patron de que el guard siempre consulta "el mas reciente".

### Veredicto D.2: APROBADO

Los edge cases estan cubiertos por la combinacion de constraints de BD y logica de aplicacion. No hay ambiguedad ni escenario no controlado.

---

# Seccion E: CASCADE vs RESTRICT -- Flujo de Eliminacion de Cuenta

---

## E.1 Verificacion paso a paso

```
1. DELETE FROM users WHERE id = :uid

2. PostgreSQL evalua ON DELETE CASCADE en todas las FK que apuntan a users(id):

   consents.user_id        -> CASCADE -> DELETE FROM consents WHERE user_id = :uid
   preferences.user_id     -> CASCADE -> DELETE FROM preferences WHERE user_id = :uid
   sessions.user_id        -> CASCADE -> DELETE FROM sessions WHERE user_id = :uid
   message_reports.reporter_id -> CASCADE -> DELETE message_reports
   safety_events.user_id   -> CASCADE -> DELETE safety_events
   password_reset_tokens.user_id -> CASCADE -> DELETE password_reset_tokens

   audit_logs.admin_id     -> SET NULL -> UPDATE audit_logs SET admin_id = NULL
   survey_responses.user_id    -> SET NULL -> UPDATE survey_responses SET user_id = NULL
   survey_responses.imported_by -> SET NULL -> UPDATE survey_responses SET imported_by = NULL
   system_config.updated_by    -> SET NULL -> UPDATE system_config SET updated_by = NULL
   consent_versions.created_by -> SET NULL -> UPDATE consent_versions SET created_by = NULL

3. Al borrar las filas de consents (paso 2):
   - Cada fila borrada tenia consent_version_id -> consent_versions(id) ON DELETE RESTRICT
   - Pero RESTRICT no se evalua aqui porque NO se esta borrando de consent_versions
   - Se esta borrando de consents (la tabla que contiene la FK)
   - La FK simplemente desaparece con la fila
   - consent_versions queda INTACTA

4. Al borrar sessions (paso 2):
   - CASCADE secundario: DELETE FROM messages WHERE session_id IN (...)
   - CASCADE terciario: DELETE FROM attachments WHERE message_id IN (...)
   - Cada nivel se propaga correctamente
```

## E.2 Confirmacion

| Paso | Tabla afectada | Accion | RESTRICT interfiere? |
|------|---------------|--------|---------------------|
| 1 | users | DELETE directa | N/A |
| 2a | consents | CASCADE desde users | **NO** -- RESTRICT solo aplica al borrar de consent_versions |
| 2b | preferences | CASCADE desde users | N/A |
| 2c | sessions | CASCADE desde users | N/A |
| 3a | messages | CASCADE secundario desde sessions | N/A |
| 3b | attachments | CASCADE terciario desde messages | N/A |
| 4 | consent_versions | **No se toca** | N/A -- nadie intento borrar de consent_versions |

### Veredicto E: APROBADO

`ON DELETE RESTRICT` en `consents.consent_version_id` **no interfiere** con el CASCADE de eliminacion de cuenta. La fila de `consents` se borra (CASCADE desde `users`), lo cual elimina la FK. RESTRICT nunca se evalua porque nadie intenta borrar de `consent_versions`. Las filas de `consent_versions` quedan intactas, preservando el historial de versiones del documento de consentimiento.

---

# Seccion F: Resumen de Veredictos

---

## F.1 Lista de aprobaciones y objeciones

| Punto | Evaluacion | Veredicto |
|-------|-----------|-----------|
| **A.1** Tipos de datos (UUID, TEXT, JSONB, TIMESTAMP, INT) | Mapeo directo en SQLAlchemy 2.0 | APROBADO |
| **A.2** CHECK constraint `status IN (...)` | Identico a los CHECK existentes | APROBADO |
| **A.3** ON DELETE RESTRICT + CASCADE en la misma tabla | Independientes y compatibles | APROBADO |
| **A.4** FK `consent_version_id` vs acoplamiento suave | Tecnicam. correcta, contradice veredicto Agente 02 | APROBADO CON OBSERVACION |
| **B.1** ConsentVersionRepository | Encaja en patron existente | APROBADO |
| **B.2** SystemConfigRepository | Encaja en patron, preferir TEXT PK | APROBADO CON OBSERVACION |
| **B.3** Conflicto con repos existentes | Sin conflictos | APROBADO |
| **C.1** ConsentService transaccion atomica | `async with session.begin()` + indice unico | APROBADO |
| **C.2** ConfigService cache con async | Funciona con singleton + session_factory | APROBADO CON OBSERVACIONES |
| **C.3** ChatService latency_ms con monotonic | Patron correcto, compatible con adapter | APROBADO |
| **C.4** ConsentGuard 3 estados | Implementable como Depends() de FastAPI | APROBADO |
| **D.1** Cobertura de estados | 4 estados cubiertos sin ambiguedad | APROBADO |
| **D.2** Edge cases consentimiento | Controlados por BD + app | APROBADO |
| **E** CASCADE + RESTRICT | RESTRICT no interfiere con CASCADE | APROBADO |

**Total: 14 puntos evaluados. 14 aprobados (3 con observaciones). 0 objeciones bloqueantes.**

---

## F.2 Observaciones que requieren decision

| # | Observacion | Actores involucrados | Recomendacion |
|---|-------------|---------------------|---------------|
| 1 | La variante propone `consent_version_id FK` pero el Arbitro (Agente 02) decidio acoplamiento suave | Agente 02, Agente 04 | La FK es tecnicam. superior. Resolver discrepancia con el Arquitecto. **El Backend recomienda la FK.** |
| 2 | La variante propone `UUID PK` para `system_config` pero el DDL aprobado usa `TEXT PK` (key) | Agente 03, Agente 04 | Mantener `TEXT PK` por simplicidad. UUID PK es innecesario para tabla key-value de <20 filas. |
| 3 | `ConfigService` singleton debe usar `async_sessionmaker`, no una session fija | Agente 04, Agente 11 | Documentar en el contrato de servicio. Implementar con `async_sessionmaker[AsyncSession]` como dependencia. |

---

## F.3 Patrones de implementacion recomendados

### Modelo SQLAlchemy para consent_versions (variante con status)

```python
import uuid
import datetime
from sqlalchemy import Text, Boolean, DateTime, CheckConstraint, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ConsentVersion(Base):
    __tablename__ = "consent_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    version: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="draft"
    )
    published_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'active', 'archived')",
            name="chk_consent_versions_status",
        ),
        Index(
            "uq_consent_versions_active_status",
            "status",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )
```

### Modelo SQLAlchemy para system_config (PK = key TEXT)

```python
class SystemConfig(Base):
    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
```

### Modelo SQLAlchemy para consents actualizado (con consent_version_id y revoked_at)

```python
class Consent(Base):
    __tablename__ = "consents"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    accepted_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    revoked_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    consent_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("consent_versions.id", ondelete="RESTRICT"), nullable=True
    )

    # Relationships
    user = relationship("User", back_populates="consents")
    consent_version = relationship("ConsentVersion")

    __table_args__ = (
        CheckConstraint(
            "scope IN ('solo_uso', 'uso_mejora_anon')",
            name="chk_consents_scope",
        ),
        Index("idx_consents_user_accepted", "user_id", accepted_at.desc()),
    )
```

### Modelo SQLAlchemy para messages actualizado (con latency_ms)

```python
class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_sha256: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    safety_flags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tokens_prompt: Mapped[int | None] = mapped_column(nullable=True)
    tokens_completion: Mapped[int | None] = mapped_column(nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(nullable=True)  # Evo 004
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('system', 'user', 'assistant')",
            name="chk_messages_role",
        ),
        Index("idx_messages_session_time", "session_id", "created_at"),
        Index(
            "idx_messages_latency",
            "created_at",
            postgresql_where=text("role = 'assistant' AND latency_ms IS NOT NULL"),
        ),
    )
```

---

## F.4 Confirmacion final de CASCADE + RESTRICT

**CASCADE en `consents.user_id` y RESTRICT en `consents.consent_version_id` funcionan correctamente juntos.**

- `DELETE FROM users WHERE id = X` -> CASCADE borra filas de `consents` donde `user_id = X`. RESTRICT en `consent_version_id` no se evalua (no se borra de `consent_versions`).
- `DELETE FROM consent_versions WHERE id = Y` -> RESTRICT impide el DELETE si alguna fila en `consents` tiene `consent_version_id = Y`. Esto es el comportamiento deseado (no borrar versiones que alguien acepto).
- `consent_versions` siempre queda intacta tras eliminacion de un usuario.
- Los registros historicos con `consent_version_id = NULL` no generan conflicto con RESTRICT (NULL no participa en FK checks).

---

> **Firma:**
> Agente 04 -- Backend Developer
> Proyecto Mabel IA
> 2026-02-22
>
> **Fuentes consultadas:**
> - Context7: SQLAlchemy 2.1 documentation (`/websites/sqlalchemy_en_21`) -- CASCADE, RESTRICT, mapped_column, CheckConstraint, async sessions
> - Context7: FastAPI documentation (`/websites/fastapi_tiangolo`) -- dependency injection, session management, middleware patterns
> - PostgreSQL 16 documentation -- FK semantics, partial unique indices, cascade behavior
