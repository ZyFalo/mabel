# FASE 3 -- Evaluacion de Capa de Aplicacion para Gaps de BD

> **Proyecto:** Mabel IA -- Asistente de Psicoeducacion para Salud Mental Estudiantil UMB
> **Agente:** 04 -- Backend Developer
> **Fecha:** 2026-02-22
> **Fuentes consultadas:**
> - Reporte Fase 2: `docs/FASE2_MAPEO_OPERACIONES_BD.md`
> - DDL definitivo: `db/schema_postgresql.sql` (215 lineas, 11 tablas)
> - Catalogo de Interfaces: `docs/INTERFACES_MVP_CATALOGO.md` (42 interfaces)
> - Tech Stack: `TECHSTACK.md` (14 ADRs)
> - Context7 MCP: FastAPI (`/websites/fastapi_tiangolo`) -- Pydantic BaseSettings, env vars, configuration patterns
> - Context7 MCP: SQLAlchemy (`/websites/sqlalchemy_en_21`) -- percentile_cont, JSONB queries, aggregate functions

---

## Criterios de Evaluacion

Para cada gap, evaluo desde la perspectiva del Agente 04 (Backend Developer) considerando:

1. **Mantenibilidad:** Que tan facil es mantener la solucion a largo plazo.
2. **Auditabilidad:** Si cumple con Ley 1581/2012 para consentimiento y datos sensibles.
3. **Hot-reload:** Si el admin puede cambiar configuracion sin reiniciar el servidor.
4. **Consistencia multi-instancia:** Si la solucion se desincroniza con 2+ instancias (post-MVP).
5. **MVP pragmatismo:** Con 30 usuarios y 1 servidor, evaluar si el cambio es over-engineering.

---

# PARTE 1 -- EVALUACION DE GAPS CRITICOS

---

## EVALUACION GAP-001: No existe tabla para configuracion global del sistema

```
EVALUACION GAP-001: Configuracion global del sistema (#30)
+-- Resoluble en app? PARCIALMENTE
+-- Mecanismo: Hibrido -- archivo YAML/JSON para defaults + BD para datos editables por admin
+-- Necesita cambio BD? SI (pero mas simple de lo propuesto)
+-- Si SI: Crear tabla `system_config` key-value con JSONB
+-- Recomendacion final: BD para guardrails y parametros editables; env vars/codigo para estado de servicios
```

### Analisis detallado

La interfaz #30 tiene 4 secciones. Analizo cada una por separado:

**Seccion 1 -- Consentimiento:** Se analiza en GAP-002. Requiere BD obligatoriamente.

**Seccion 2 -- Guardrails (keywords, umbral SOS, toggle global):**

La pregunta clave es: puede el admin editar keywords de guardrails desde la web sin reiniciar el servidor?

- **Opcion A: Archivo JSON recargable en caliente.** FastAPI puede implementar un `FileWatcher` o un endpoint que haga `reload()` del JSON. Pero esto tiene problemas serios:
  - Si hay 2+ instancias (post-MVP en Railway), cada instancia tendria su propio archivo. Un cambio en una instancia no se propaga a las demas.
  - No hay audit trail nativo. Habria que implementar logging manual de cada cambio.
  - El admin no puede editar un archivo en el servidor desde la interfaz web sin un mecanismo custom de escritura.

- **Opcion B: Variables de entorno.** Imposible. Las env vars se cargan al inicio del proceso. Cambiarlas requiere reiniciar. No cumple el requisito de hot-reload desde el panel admin.

- **Opcion C: Tabla `system_config` en BD.** La solucion correcta:
  - El admin edita desde #30 -> PUT `/api/v1/admin/config/guardrails` -> UPDATE en BD.
  - Cualquier instancia del backend lee la config vigente al procesar cada mensaje (o con cache TTL corto de 60s).
  - Audit trail nativo via `audit_logs`.
  - Hot-reload sin reiniciar: el backend consulta la BD en cada ciclo de guardrails (o cada N segundos con cache).

- **Seccion 3 -- API Gemini (timeout, modelo):**
  - El timeout y modelo actual podrian vivir en env vars (`GEMINI_TIMEOUT_MS`, `GEMINI_MODEL`). Pero la interfaz #30 dice que el admin puede cambiarlos desde el panel web. Esto descalifica env vars.
  - Solucion: `system_config` con keys `gemini_timeout_ms` y `gemini_model`. Misma tabla que guardrails.

- **Seccion 4 -- Estado del Sistema:**
  - Version app = constante en codigo (`__version__ = "1.0.0"`). No necesita BD.
  - Estado BD = `SELECT 1` al momento de la peticion. Runtime.
  - Estado ASR/TTS = health check al proceso local. Runtime.
  - Uptime = `time.monotonic() - start_time`. Runtime.
  - **No necesita BD.** Todo es runtime health check resuelto en la capa de aplicacion.

### Veredicto

| Sub-seccion | Veredicto | Mecanismo |
|-------------|-----------|-----------|
| Guardrails (keywords, umbral, toggle) | **BD** | Tabla `system_config` key-value |
| API Gemini (timeout, modelo) | **BD** | Tabla `system_config` key-value |
| Estado del Sistema | **App** | Health checks en runtime, constantes en codigo |

**Necesita cambio BD: SI.** Crear tabla `system_config`. Pero es una tabla simple:

```sql
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Complejidad minima. Se pre-carga con valores por defecto en la migracion inicial (seed).

### Implementacion en FastAPI

El servicio de configuracion en la capa de aplicacion usaria un patron de cache con TTL:

```python
# Pseudocodigo del servicio de configuracion
class ConfigService:
    def __init__(self, db: AsyncSession):
        self._db = db
        self._cache: dict[str, Any] = {}
        self._cache_expires_at: float = 0

    async def get(self, key: str) -> Any:
        if time.monotonic() > self._cache_expires_at:
            await self._reload_cache()
        return self._cache.get(key)

    async def set(self, key: str, value: Any, admin_id: UUID) -> None:
        # UPDATE o INSERT en system_config
        # Invalida cache local
        # Registra en audit_logs
        ...
```

Esto da hot-reload con un TTL de 60 segundos (configurable). Para MVP con 1 instancia, es suficiente. Para post-MVP con multiples instancias, cada instancia refresca su cache independientemente del mismo PostgreSQL.

---

## EVALUACION GAP-002: No existe tabla para versiones del documento de consentimiento

```
EVALUACION GAP-002: Versiones del documento de consentimiento
+-- Resoluble en app? NO
+-- Mecanismo: N/A -- la BD es obligatoria
+-- Necesita cambio BD? SI
+-- Si SI: Crear tabla `consent_versions` con body_text, version, is_active
+-- Recomendacion final: Tabla nueva obligatoria por requisitos legales y funcionales
```

### Analisis detallado

Evaluo las alternativas a una tabla de BD:

**Alternativa 1: Archivo Markdown versionado en el repositorio (git history).**

- Ventajas: Simple, el versionado viene gratis con git.
- Problemas graves:
  - El admin NO puede editar el texto desde la interfaz #30 ("Crear nueva version" con editor de texto). Editar requiere acceso al repositorio, hacer commit, y redeployar. Esto es inaceptable para un usuario admin no tecnico.
  - La Ley 1581/2012 requiere versionado auditable. Git history ES auditable tecnicamente, pero: (a) no es accesible desde la aplicacion, (b) no permite correlacionar que version acepto cada usuario con el texto exacto de esa version, (c) el PO de la tesis no puede verificar el cumplimiento sin acceso al repo.
  - Si el deploy reconstruye la imagen Docker, el archivo puede tener la version del momento del build, no la version activa del sistema.

**Alternativa 2: Archivo JSON/YAML cargado en `system_config` (GAP-001).**

- Se podria almacenar el texto como un value JSONB en `system_config` con key `consent_active`.
- Problemas:
  - No hay historial de versiones. `system_config` es key-value; al cambiar el valor, se pierde el texto anterior.
  - Se podria hacer un key por version (`consent_v1`, `consent_v2`), pero es un hack.
  - No hay FK desde `consents.version` al texto real de esa version. La integridad referencial es imposible.

**Alternativa 3: Tabla `consent_versions` dedicada.**

- El admin crea una version desde #30 -> POST -> INSERT en `consent_versions`.
- La interfaz #06 consulta `SELECT body_text FROM consent_versions WHERE is_active = true`.
- La tabla `consents` tiene `version TEXT` que se correlaciona con `consent_versions.version`.
- Historial completo: todas las versiones pasadas se preservan en la tabla.
- Auditabilidad perfecta: cada version tiene `created_by` (admin), `created_at`, y el texto exacto.

### Argumento legal

La Ley 1581/2012 y el Decreto 1377/2013 exigen:
- Consentimiento previo, expreso e informado (Art. 9).
- El texto del consentimiento debe estar disponible para consulta posterior.
- Debe ser demostrable que el texto que el usuario acepto es el texto que estaba vigente en ese momento.

Sin tabla `consent_versions`, no se puede demostrar que el `version "1.0"` que el usuario acepto corresponde a un texto especifico. El texto seria un archivo que puede cambiar sin registro.

### Veredicto

**Necesita cambio BD: SI, obligatoriamente.** La tabla `consent_versions` no es over-engineering; es un requisito legal y funcional.

```sql
CREATE TABLE consent_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL UNIQUE,
  body_text   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Garantizar que solo una version puede estar activa
CREATE UNIQUE INDEX uq_consent_versions_active
  ON consent_versions(is_active) WHERE is_active = true;
```

### Implementacion en FastAPI

```python
# Endpoint para crear nueva version de consentimiento
@router.post("/api/v1/admin/config/consent")
async def create_consent_version(
    payload: ConsentVersionCreate,  # Pydantic model con version, body_text
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    # 1. Desactivar version anterior
    # UPDATE consent_versions SET is_active = false WHERE is_active = true
    # 2. Insertar nueva version activa
    # INSERT INTO consent_versions (version, body_text, is_active, created_by)
    # 3. Registrar en audit_logs
    ...
```

---

## EVALUACION GAP-003: No existe columna `messages.latency_ms` para metricas

```
EVALUACION GAP-003: Almacenamiento de latencia por turno
+-- Resoluble en app? PARCIALMENTE (JSONB funciona pero es suboptimo)
+-- Mecanismo: meta JSONB con key "latency_ms" + cast en query
+-- Necesita cambio BD? SI (recomendado)
+-- Si SI: ALTER TABLE messages ADD COLUMN latency_ms INT
+-- Recomendacion final: Columna dedicada -- costo minimo, beneficio alto
```

### Analisis detallado

**Alternativa 1: Almacenar en `messages.meta` (JSONB) sin columna dedicada.**

Ventajas:
- Cero cambios en BD. El campo `meta JSONB` ya existe.
- La convencion seria: `{"model": "gemini-2.5-flash", "temperature": 0.7, "latency_ms": 1234}`.

Problemas:
- Consulte Context7 para SQLAlchemy `percentile_cont`: la funcion requiere un tipo sortable nativo (INT, NUMERIC). Sobre JSONB, se necesita `(meta->>'latency_ms')::INT` por cada fila, lo cual impide el uso de indices.
- PostgreSQL 16 NO puede usar un indice B-tree sobre una expresion JSONB para `percentile_cont`. Un indice GIN sobre `meta` ayuda con operadores `?` y `@>`, pero NO con ORDER BY ni agregaciones.
- Calculo de impacto MVP (6,000 mensajes assistant): ~5-10ms. Aceptable.
- Calculo post-MVP (100K+ mensajes): ~500ms+. Problematico.

**Alternativa 2: Columna dedicada `messages.latency_ms INT`.**

Ventajas:
- `percentile_cont(0.5) WITHIN GROUP (ORDER BY m.latency_ms)` funciona nativamente y es indexable.
- El indice parcial `WHERE role = 'assistant' AND latency_ms IS NOT NULL` hace la query eficiente para cualquier volumen.
- En SQLAlchemy 2.0+, segun Context7, `func.percentile_cont(0.5).within_group(Message.latency_ms)` es directamente soportado.

Costo:
- Un `ALTER TABLE messages ADD COLUMN latency_ms INT;` -- operacion instantanea (columna nullable, sin default, sin rewrite de tabla).
- Un `CREATE INDEX` parcial.

### Evaluacion de pragmatismo MVP

El argumento "para 30 usuarios no importa" es valido para el rendimiento. Pero hay otra razon para preferir la columna dedicada:

- **Claridad de contrato:** Si la latencia es parte del schema explicito, tanto el backend como el dashboard admin saben exactamente donde encontrarla. No hay ambiguedad de "busca en meta.latency_ms si existe".
- **Calidad de datos:** Una columna dedicada permite documentar que se registra latencia. Con JSONB, es una convencion no forzada que algun INSERT podria omitir.
- **Costo del cambio:** Agregar una columna nullable INT a una tabla es la operacion mas barata posible en PostgreSQL (no reescribe la tabla, no bloquea lecturas).

### Veredicto

**Necesita cambio BD: SI, recomendado.** El costo es minimo (1 ALTER TABLE + 1 CREATE INDEX) y el beneficio es alto (queries de metricas nativas, contrato explicito, indexable).

```sql
ALTER TABLE messages ADD COLUMN latency_ms INT;
CREATE INDEX idx_messages_latency ON messages(created_at)
  WHERE role = 'assistant' AND latency_ms IS NOT NULL;
```

### Implementacion en FastAPI

La latencia se mide en el servicio de chat al invocar el LLM:

```python
async def process_message(self, user_message: str, session_id: UUID) -> Message:
    start = time.monotonic()

    # Invoke LLM via adapter
    response = await self.llm_provider.generate(messages=prompt_messages)

    latency_ms = int((time.monotonic() - start) * 1000)

    # Persist message with latency
    assistant_msg = Message(
        session_id=session_id,
        role="assistant",
        content=response.text,
        latency_ms=latency_ms,  # Columna dedicada
        tokens_prompt=response.prompt_tokens,
        tokens_completion=response.completion_tokens,
        meta={"model": response.model, "temperature": response.temperature},
    )
    db.add(assistant_msg)
```

---

# PARTE 2 -- EVALUACION DE GAPS MENORES

---

## EVALUACION GAP-004: Falta indice en consents(user_id, accepted_at DESC)

```
EVALUACION GAP-004: Indice para verificacion de consentimiento vigente
+-- Resoluble en app? NO (es un indice de BD)
+-- Mecanismo: N/A
+-- Necesita cambio BD? SI
+-- Si SI: CREATE INDEX idx_consents_user_accepted ON consents(user_id, accepted_at DESC)
+-- Recomendacion final: Agregar. Costo cero, best practice, protege contra crecimiento futuro.
```

### Analisis

Este gap es puramente un indice de BD. No hay alternativa en la capa de aplicacion -- no se puede "cachear" la verificacion de consentimiento en el backend porque:

1. La verificacion ocurre en cada request autenticado (middleware/guard).
2. La version activa del consentimiento puede cambiar en cualquier momento (cuando el admin crea nueva version via GAP-002).
3. Cachear el estado de consentimiento del usuario introduce riesgo de servir contenido a un usuario cuyo consentimiento ya no es vigente.

Para MVP con 30 usuarios y ~60 registros en `consents`, la ausencia del indice no causa impacto medible. Pero el indice es un `CREATE INDEX` que toma <1ms en crearse y protege contra degradacion futura.

**Veredicto: BD.** Agregar indice.

---

## EVALUACION GAP-005: Falta `users.last_active_at`

```
EVALUACION GAP-005: Ultimo acceso de usuario
+-- Resoluble en app? SI
+-- Mecanismo: Subquery MAX(sessions.started_at) en la query de listado
+-- Necesita cambio BD? NO (para MVP)
+-- Si NO: Subquery correlacionada, aceptable para 30 usuarios
+-- Recomendacion final: Resolver en app con subquery. No agregar columna desnormalizada.
```

### Analisis

Dos opciones evaluadas:

**Opcion A: Subquery `MAX(sessions.started_at)`.**

```python
# En SQLAlchemy 2.0+
from sqlalchemy import select, func

last_active_subq = (
    select(func.max(Session.started_at))
    .where(Session.user_id == User.id)
    .correlate(User)
    .scalar_subquery()
    .label("last_active_at")
)

stmt = select(User, last_active_subq).where(
    User.role == "student",
    User.deleted_at.is_(None),
)
```

- Para 30 usuarios: cada subquery usa el indice `idx_sessions_user_time` (ya existe). Tiempo estimado: <1ms por fila, <30ms total.
- No requiere ningun cambio en BD ni logica adicional de sincronizacion.

**Opcion B: Columna desnormalizada `users.last_active_at`.**

- Requiere: ALTER TABLE + trigger o logica de aplicacion para actualizar al crear sesion.
- Introduce complejidad: mantener la columna sincronizada (que pasa si se elimina una sesion? hay que recalcular).
- Riesgo de inconsistencia si algun flujo olvida actualizar la columna.

**Veredicto: App.** La subquery es la solucion correcta para MVP. La columna desnormalizada es premature optimization para 30 usuarios.

---

## EVALUACION GAP-006: Falta `consents.revoked_at`

```
EVALUACION GAP-006: Estado "Revocado" de consentimiento
+-- Resoluble en app? DEPENDE de decision funcional
+-- Mecanismo: Logica de negocio en el servicio de consentimiento
+-- Necesita cambio BD? SI (recomendado)
+-- Si SI: ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP
+-- Recomendacion final: Agregar columna. Costo minimo. Habilita filtro de #28 correctamente.
```

### Analisis

La pregunta central es: puede un usuario revocar su consentimiento sin eliminar su cuenta?

Segun la interfaz #17 (Modal de Revocacion):
- **Opcion 1:** Revocar scope "uso + mejora anonima" -> bajar a "solo_uso". Esto es un PATCH, no una revocacion total. El usuario sigue activo.
- **Opcion 2:** Revocar completamente -> lleva a eliminacion de cuenta (#16). La cuenta se elimina con CASCADE.

Esto implica que en la practica actual, "Revocado" como estado persistente (usuario sigue existiendo pero sin consentimiento) parece imposible. Sin embargo:

1. **Escenario no cubierto:** Un admin podria necesitar revocar el consentimiento de un usuario por motivos legales (ej: solicitud ARCO de cancelacion parcial) sin eliminar la cuenta inmediatamente. La Ley 1581/2012 contempla el derecho de oposicion parcial.

2. **Escenario de nueva version:** Si el admin publica una nueva version de consentimiento (via GAP-002), los usuarios con version anterior quedan en estado "Pendiente" (deben re-aceptar). Esto no es "Revocado" sino "Desactualizado".

3. **Filtro de #28:** La interfaz pide "Vigente/Pendiente/Revocado". Si el estado "Revocado" no existe, el filtro deberia ser "Vigente/Pendiente" y se simplifica. Sin embargo, agregar la columna `revoked_at` tiene costo cercano a cero y deja preparado el sistema para escenarios legales futuros.

**Alternativa en app sin columna:** Se podria derivar el estado "Revocado" como "usuario cuyo ultimo consent tiene scope = 'solo_uso' Y fue previamente 'uso_mejora_anon'". Pero esto requiere comparar registros historicos, es fragil, y no captura revocaciones administrativas.

**Veredicto: BD.** Agregar `consents.revoked_at TIMESTAMP`. El costo es un ALTER TABLE trivial. El beneficio es un modelo de datos limpio que contempla escenarios legales reales.

```sql
ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP;
```

---

## EVALUACION GAP-007: Falta indice en attachments(message_id)

```
EVALUACION GAP-007: Indice en attachments por message_id
+-- Resoluble en app? NO (es un indice de BD)
+-- Mecanismo: N/A
+-- Necesita cambio BD? SI
+-- Si SI: CREATE INDEX idx_attachments_message ON attachments(message_id)
+-- Recomendacion final: Agregar. Standard practice para FK sin indice implicito.
```

### Analisis

PostgreSQL NO crea automaticamente un indice en la columna que tiene un FOREIGN KEY. Solo crea indice en la columna REFERENCES (la PK). Esto significa que `attachments.message_id` no tiene indice.

La query `SELECT * FROM attachments WHERE message_id = :id` haria un sequential scan sin el indice.

No hay alternativa en la capa de aplicacion. No se puede "evitar" consultar attachments por message_id -- es una operacion fundamental del chat (#10 muestra adjuntos) y del detalle de sesion (#14).

Se podria argumentar que con pocos attachments (<100 en MVP), el seq scan es rapido. Es cierto, pero el indice ocupa bytes y se crea en <1ms. No hay razon para no crearlo.

**Veredicto: BD.** Agregar indice.

---

## EVALUACION GAP-008: Falta indice en message_reports(reporter_id)

```
EVALUACION GAP-008: Indice en message_reports por reporter_id
+-- Resoluble en app? NO (es un indice de BD)
+-- Mecanismo: N/A
+-- Necesita cambio BD? SI
+-- Si SI: CREATE INDEX idx_message_reports_reporter ON message_reports(reporter_id)
+-- Recomendacion final: Agregar. El indice UNIQUE existente no cubre busquedas por reporter_id solo.
```

### Analisis

El indice UNIQUE existente `uq_message_reports_msg_user` es sobre `(message_id, reporter_id)`. En un indice B-tree compuesto, solo la primera columna se puede usar para busquedas de igualdad sin la segunda. Buscar `WHERE reporter_id = :uid` NO usa ese indice.

La interfaz #29 (Detalle Usuario admin) muestra "Reportes realizados" por usuario. La interfaz #40 (Exportacion ARCO) cuenta reportes por usuario. Ambas necesitan buscar por `reporter_id`.

**Veredicto: BD.** Agregar indice.

---

# PARTE 3 -- EVALUACION DE RIESGOS DE RENDIMIENTO

---

## EVALUACION RISK-001: Percentiles sobre JSONB sin GIN

```
EVALUACION RISK-001: Calculo de percentiles de latencia sobre JSONB
+-- Aplica? SOLO si GAP-003 NO se resuelve con columna dedicada
+-- Si GAP-003 se resuelve: RISK-001 desaparece automaticamente
+-- Mitigacion en app: Cast JSONB + query funcional (~5-10ms para 6K filas)
+-- Recomendacion: Resolver GAP-003 y este riesgo deja de existir
```

### Analisis

Este riesgo es contingente a la decision sobre GAP-003. Si se agrega la columna `messages.latency_ms` (recomendado), `percentile_cont` opera sobre un tipo INT nativo con indice parcial. El riesgo se elimina completamente.

Si por alguna razon no se agrega la columna, la alternativa en la capa de aplicacion seria:

```python
# Calcular percentiles en Python en vez de SQL
rows = await db.execute(
    select(Message.meta["latency_ms"].as_integer())
    .where(Message.role == "assistant", Message.meta["latency_ms"].isnot(None))
)
latencies = sorted([r[0] for r in rows])
p50 = latencies[len(latencies) // 2]
p95 = latencies[int(len(latencies) * 0.95)]
p99 = latencies[int(len(latencies) * 0.99)]
```

Esto es funcional para MVP pero delega el calculo al backend (Python) en vez de PostgreSQL. Para 6K registros, ambas opciones son equivalentes en rendimiento.

**Veredicto: Se resuelve con GAP-003.** Si GAP-003 se implementa, RISK-001 no aplica.

---

## EVALUACION RISK-002: Queries agregadas del Dashboard Admin sin vistas materializadas

```
EVALUACION RISK-002: Dashboard con multiples queries agregadas
+-- Resoluble en app? SI
+-- Mecanismo: Queries paralelas + cache en memoria con TTL
+-- Necesita cambio BD? NO
+-- Si NO: Cache de dashboard en el servicio con TTL de 30-60 segundos
+-- Recomendacion: No crear vistas materializadas. Usar cache en app.
```

### Analisis

El dashboard #24 ejecuta ~12 queries al cargar (6 KPIs + 6 graficas). Para MVP:

- 30 usuarios, <10K registros por tabla.
- Cada COUNT/AVG sobre <10K filas: <5ms.
- 12 queries en paralelo (asyncio.gather): <50ms total.
- PostgreSQL 16 maneja esto sin esfuerzo.

La solucion en la capa de aplicacion es optima:

```python
class DashboardService:
    _cache: dict = {}
    _cache_ttl: int = 30  # segundos

    async def get_dashboard(self) -> DashboardData:
        if self._is_cache_valid():
            return self._cache["data"]

        # Ejecutar todas las queries en paralelo
        results = await asyncio.gather(
            self._count_active_users(),
            self._count_sessions_today(),
            self._count_safety_events_24h(),
            self._count_open_reports(),
            self._avg_latency(),
            self._avg_sus_score(),
        )
        # Cache por 30 segundos
        ...
```

Crear vistas materializadas para <10K registros es over-engineering. Las vistas materializadas tienen overhead de mantenimiento (`REFRESH MATERIALIZED VIEW`) y complejidad operativa que no se justifica en MVP.

Post-MVP, si la carga del dashboard supera 1 segundo, se pueden considerar vistas materializadas o una tabla de metricas pre-calculadas con refresh periodico (cron job).

**Veredicto: App.** Cache con TTL en el servicio de dashboard. Sin cambios en BD.

---

## EVALUACION RISK-003: Filtro de consentimiento con logica compleja

```
EVALUACION RISK-003: Filtro estado de consentimiento en #28
+-- Resoluble en app? PARCIALMENTE (requiere GAP-002 y GAP-006 resueltos)
+-- Mecanismo: Query con CASE + LEFT JOIN LATERAL
+-- Necesita cambio BD? NO (adicional a GAP-002 y GAP-006)
+-- Si NO: La logica de derivacion de estado se implementa en el repositorio
+-- Recomendacion: Implementar en app con query SQL bien construida. Depende de GAP-002 y GAP-006.
```

### Analisis

Con GAP-002 (tabla `consent_versions`) y GAP-006 (columna `revoked_at`) resueltos, el filtro de estado se implementa completamente en una query SQL dentro del repositorio de usuarios:

```python
# En el repositorio de usuarios (SQLAlchemy)
def _consent_status_expression(self):
    """Expresion SQL que deriva el estado de consentimiento."""
    active_version_subq = (
        select(ConsentVersion.version)
        .where(ConsentVersion.is_active == True)
        .scalar_subquery()
    )

    latest_consent_subq = (
        select(Consent)
        .where(Consent.user_id == User.id)
        .order_by(Consent.accepted_at.desc())
        .limit(1)
        .lateral()
    )

    return case(
        (latest_consent_subq.c.id.is_(None), literal("Pendiente")),
        (latest_consent_subq.c.revoked_at.isnot(None), literal("Revocado")),
        (latest_consent_subq.c.version < active_version_subq, literal("Pendiente")),
        else_=literal("Vigente"),
    )
```

Esta logica vive integramente en la capa de aplicacion (repository layer), no requiere cambios adicionales en BD mas alla de GAP-002 y GAP-006.

**Veredicto: App.** La logica de derivacion de estado es responsabilidad del repositorio. No requiere cambios BD adicionales.

---

## EVALUACION RISK-004: Top keywords de guardrails sobre JSONB no indexado

```
EVALUACION RISK-004: Top 5 keywords de safety_events.payload
+-- Resoluble en app? SI
+-- Mecanismo: Query SQL funcional + calculo en Python como fallback
+-- Necesita cambio BD? NO
+-- Si NO: Query con jsonb_array_elements_text, aceptable para <1000 safety_events
+-- Recomendacion: Mantener query SQL directa para MVP. Opcional: indice GIN post-MVP.
```

### Analisis

La query para extraer top keywords:

```sql
SELECT keyword, COUNT(*) AS frequency
FROM safety_events,
  jsonb_array_elements_text(payload->'keywords') AS keyword
WHERE event_type IN ('risk_detected', 'guardrail_triggered')
  AND created_at >= :start_date
GROUP BY keyword
ORDER BY frequency DESC
LIMIT 5;
```

Para MVP con 30 usuarios:
- Estimacion conservadora: ~50-200 safety_events en el periodo del estudio.
- `jsonb_array_elements_text` sobre 200 filas con ~2-3 keywords cada una: <5ms.
- No necesita indice GIN.

Si se quisiera resolver completamente en la capa de aplicacion (Python), seria:

```python
# Alternativa: calcular en Python
events = await db.execute(
    select(SafetyEvent.payload)
    .where(SafetyEvent.event_type.in_(["risk_detected", "guardrail_triggered"]))
)
from collections import Counter
keyword_counts = Counter()
for event in events:
    keywords = event.payload.get("keywords", [])
    keyword_counts.update(keywords)
top_5 = keyword_counts.most_common(5)
```

Ambas opciones son viables. La query SQL es preferible porque mantiene la logica cerca de los datos y evita transferir payloads JSONB completos al backend.

**Veredicto: App.** Query SQL directa en el repositorio. Sin cambios en BD.

---

## EVALUACION RISK-005: Exportacion ARCO con JOINs multi-tabla

```
EVALUACION RISK-005: Exportacion de datos personales (#40)
+-- Resoluble en app? SI (ya funciona con el esquema actual)
+-- Mecanismo: Multiples queries secuenciales por tabla, ensambladas en Python
+-- Necesita cambio BD? NO
+-- Si NO: El esquema actual soporta la exportacion completamente
+-- Recomendacion: Sin cambios. Implementar como servicio con queries independientes por tabla.
```

### Analisis

La exportacion ARCO es una operacion puntual (un usuario la pide una vez). No necesita ser optimizada.

La implementacion optima en la capa de aplicacion es NO hacer un JOIN masivo, sino queries independientes ensambladas en Python:

```python
class ARCOExportService:
    async def export_user_data(self, user_id: UUID) -> dict:
        # Queries independientes, pueden ejecutarse en paralelo
        user, consents, prefs, session_count, msg_count, report_count = (
            await asyncio.gather(
                self.user_repo.get_by_id(user_id),
                self.consent_repo.get_all_by_user(user_id),
                self.pref_repo.get_by_user(user_id),
                self.session_repo.count_by_user(user_id),
                self.message_repo.count_by_user(user_id),
                self.report_repo.count_by_user(user_id),
            )
        )
        return {
            "account": UserSchema.from_orm(user),
            "consents": [ConsentSchema.from_orm(c) for c in consents],
            "preferences": PrefSchema.from_orm(prefs),
            "statistics": {...},
        }
```

Cada query usa indices existentes (PK, FK con indices). Rendimiento: <10ms total.

**Veredicto: App.** Sin cambios en BD. El esquema actual es suficiente.

---

# PARTE 4 -- EVALUACION DE OBSERVACIONES

---

## EVALUACION OBS-001: #13 deprecated pero definido en catalogo local

```
EVALUACION OBS-001: Interfaz #13 deprecated
+-- Accion requerida? NO (en BD)
+-- Impacto en backend: Ninguno
+-- Recomendacion: No crear ruta /history en FastAPI. Las operaciones de historial se sirven
|   desde los mismos endpoints que usa #34B (sidebar). Marcar #13 como deprecated en el catalogo local.
```

Las queries de listar sesiones y eliminar sesion son las mismas independientemente de que componente UI las invoque. No hay impacto en el backend ni en la BD.

**Veredicto: Sin accion en BD ni en app.** Solo documentacion.

---

## EVALUACION OBS-002: #23 Login Admin = #03 Login

```
EVALUACION OBS-002: Login unificado
+-- Accion requerida? NO
+-- Impacto en backend: Ninguno
+-- Recomendacion: Un solo endpoint POST /api/v1/auth/login. El backend discrimina por
|   users.role y retorna JWT con claim "role". Sin accion adicional.
```

**Veredicto: Sin accion.** El backend ya tiene un solo endpoint de login.

---

## EVALUACION OBS-003: safety_events.severity en payload JSONB

```
EVALUACION OBS-003: Campo severity de safety_events
+-- Resoluble en app? SI
+-- Mecanismo: Convencion de payload JSONB + validacion en Pydantic
+-- Necesita cambio BD? NO (recomendado NO agregar columna)
+-- Si NO: Validar estructura del payload con Pydantic antes de INSERT.
|   Filtro en #25 usa (payload->>'severity')::INT.
+-- Recomendacion: Resolver en app con validacion Pydantic del payload.
```

### Analisis

La interfaz #25 filtra por severidad. La tabla `safety_events` tiene `payload JSONB` donde la severidad se almacena como parte del payload, no como columna dedicada.

Opciones:

1. **Agregar columna `safety_events.severity INT`:** Duplicaria datos que ya estan en el payload. Introduce riesgo de inconsistencia (payload dice severity=3 pero columna dice severity=4).

2. **Mantener en payload JSONB con validacion Pydantic:**

```python
class SafetyEventPayload(BaseModel):
    keywords: list[str] = []
    severity: int = Field(ge=1, le=5)
    action: str
    # ... otros campos

class SafetyEventCreate(BaseModel):
    event_type: str
    payload: SafetyEventPayload  # Validado por Pydantic
```

Pydantic garantiza que `severity` siempre existe en el payload y esta entre 1 y 5. La query de filtro:

```sql
SELECT * FROM safety_events
WHERE (payload->>'severity')::INT = :severity
ORDER BY created_at DESC;
```

Para <1000 safety_events, esta query es instantanea incluso sin indice.

**Veredicto: App.** La validacion Pydantic es la capa correcta para garantizar la estructura del payload JSONB. No se agrega columna dedicada.

---

## EVALUACION OBS-004: Tiempo resolucion de reportes = updated_at - created_at

```
EVALUACION OBS-004: Calculo de tiempo de resolucion
+-- Accion requerida? NO
+-- Impacto: La query funciona correctamente con las columnas existentes
+-- Recomendacion: Implementar la query tal como esta documentada en Fase 2. Sin cambios.
```

```python
# En el servicio de reportes
async def avg_resolution_time(self) -> timedelta:
    result = await self.db.execute(
        select(func.avg(MessageReport.updated_at - MessageReport.created_at))
        .where(MessageReport.status == "resolved")
        .where(MessageReport.updated_at.isnot(None))
    )
    return result.scalar()
```

**Veredicto: Sin accion.** El esquema actual soporta este calculo.

---

## EVALUACION OBS-005: save_history controla mensajes pero no sesiones

```
EVALUACION OBS-005: Comportamiento de save_history
+-- Accion requerida? SI (en app, no en BD)
+-- Impacto: Logica de negocio en el servicio de chat
+-- Necesita cambio BD? NO
+-- Recomendacion: Implementar la logica en la capa de servicio del chat.
```

### Analisis

Segun la decision de diseno 3.8: cuando `save_history = FALSE`, el backend NO ejecuta INSERT en `messages` pero SI crea `sessions`. Esto es logica de negocio pura:

```python
class ChatService:
    async def save_message(self, session_id: UUID, role: str, content: str, **kwargs):
        # Verificar preferencia de historial
        prefs = await self.pref_repo.get_by_user(self.current_user.id)

        if not prefs.save_history and role != "system":
            # No persistir mensajes, pero el procesamiento sigue normalmente
            return None

        message = Message(session_id=session_id, role=role, content=content, **kwargs)
        self.db.add(message)
        return message
```

El frontend verifica `preferences.save_history` para decidir si muestra el listado de sesiones en el sidebar (#34B) o el empty state "Historial desactivado".

**Veredicto: App.** Logica de negocio implementada en el servicio de chat. Sin cambios en BD.

---

## EVALUACION OBS-006: Consentimiento Requerido (#22) depende de version activa

```
EVALUACION OBS-006: Determinar version activa del consentimiento
+-- Resoluble en app? SI (una vez que GAP-002 este resuelto)
+-- Mecanismo: Query a consent_versions WHERE is_active = true
+-- Necesita cambio BD? NO (adicional a GAP-002)
+-- Recomendacion: Se resuelve automaticamente al implementar GAP-002.
```

### Analisis

Con la tabla `consent_versions` (GAP-002), determinar si el usuario necesita re-aceptar es trivial:

```python
class ConsentGuard:
    """Middleware que verifica consentimiento vigente en cada request autenticado."""

    async def __call__(self, request: Request, user: User):
        # 1. Obtener version activa del sistema
        active_version = await self.consent_version_repo.get_active_version()

        # 2. Obtener ultimo consentimiento del usuario
        user_consent = await self.consent_repo.get_latest_by_user(user.id)

        # 3. Evaluar
        if user_consent is None:
            raise ConsentRequired("No consent found")
        if user_consent.revoked_at is not None:
            raise ConsentRequired("Consent revoked")
        if user_consent.version != active_version.version:
            raise ConsentRequired(f"New consent version {active_version.version} available")

        return user_consent
```

Sin GAP-002, la version activa seria un valor hardcodeado (env var o constante en codigo), lo cual es fragil y no permite que el admin cree nuevas versiones desde #30.

**Veredicto: App** (dependiente de GAP-002). Se resuelve implementando la logica de guard en el middleware de FastAPI.

---

# PARTE 5 -- TABLA RESUMEN CON VEREDICTO FINAL

| ID | Descripcion | Veredicto | Detalle |
|----|-------------|-----------|---------|
| **GAP-001** | Tabla configuracion global | **BD** | Crear tabla `system_config` (key-value JSONB). Seccion "Estado del Sistema" se resuelve en **App** (health checks runtime). |
| **GAP-002** | Tabla versiones consentimiento | **BD** | Crear tabla `consent_versions`. Obligatoria por Ley 1581/2012 y requisitos funcionales de #06, #22, #30. |
| **GAP-003** | Columna latency_ms en messages | **BD** | ALTER TABLE messages ADD COLUMN latency_ms INT + indice parcial. Costo minimo, beneficio alto. |
| **GAP-004** | Indice consents(user_id, accepted_at) | **BD** | CREATE INDEX. Best practice, costo cero. |
| **GAP-005** | last_active_at de usuarios | **App** | Subquery MAX(sessions.started_at). Suficiente para 30 usuarios. No agregar columna. |
| **GAP-006** | revoked_at en consents | **BD** | ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP. Costo minimo, habilita filtro #28 y escenarios legales. |
| **GAP-007** | Indice attachments(message_id) | **BD** | CREATE INDEX. Standard practice para FK. |
| **GAP-008** | Indice message_reports(reporter_id) | **BD** | CREATE INDEX. El indice UNIQUE existente no cubre esta busqueda. |
| **RISK-001** | Percentiles sobre JSONB | **Resuelto por GAP-003** | Si GAP-003 se implementa, este riesgo desaparece. |
| **RISK-002** | Dashboard queries agregadas | **App** | Cache con TTL en servicio de dashboard. Sin cambios BD. |
| **RISK-003** | Filtro consentimiento complejo | **App** | Query con CASE + LATERAL en repositorio. Depende de GAP-002 y GAP-006. |
| **RISK-004** | Top keywords JSONB | **App** | Query SQL directa, aceptable para <1000 registros. Sin cambios BD. |
| **RISK-005** | Exportacion ARCO multi-tabla | **App** | Queries paralelas independientes. El esquema actual es suficiente. |
| **OBS-001** | #13 deprecated | **Sin accion** | Solo documentacion. |
| **OBS-002** | #23 = #03 Login | **Sin accion** | Un solo endpoint de login. |
| **OBS-003** | severity en payload JSONB | **App** | Validacion Pydantic del payload. No agregar columna dedicada. |
| **OBS-004** | Tiempo resolucion reportes | **Sin accion** | Query funcional con columnas existentes. |
| **OBS-005** | save_history logica | **App** | Logica de negocio en servicio de chat. |
| **OBS-006** | Version activa consentimiento | **App** | Se resuelve con GAP-002 + middleware de consentimiento. |

---

# PARTE 6 -- RECOMENDACION CONSOLIDADA

## Cambios de BD realmente necesarios

De los 8 gaps, 3 critical + 5 minor, la evaluacion concluye que se necesitan:

### Tablas nuevas: 2

| Tabla | Justificacion | Complejidad |
|-------|---------------|-------------|
| `system_config` | Admin necesita editar guardrails/parametros Gemini desde web sin reiniciar servidor. Sin tabla, no hay persistencia editable. | Baja (4 columnas, key-value) |
| `consent_versions` | Obligatoria por Ley 1581/2012. El texto del consentimiento debe ser versionado y auditable en BD. | Baja (6 columnas + 1 indice unico parcial) |

### Columnas nuevas: 2

| Columna | Tabla | Justificacion | Complejidad |
|---------|-------|---------------|-------------|
| `latency_ms INT` | messages | Metricas de percentiles eficientes. Costo cero (nullable, sin rewrite). | Trivial |
| `revoked_at TIMESTAMP` | consents | Habilita estado "Revocado" para filtros y escenarios legales. | Trivial |

### Indices nuevos: 3

| Indice | Tabla | Justificacion |
|--------|-------|---------------|
| `idx_consents_user_accepted` | consents(user_id, accepted_at DESC) | Verificacion de consentimiento en cada request |
| `idx_attachments_message` | attachments(message_id) | FK sin indice implicito |
| `idx_message_reports_reporter` | message_reports(reporter_id) | Busqueda por reporter no cubierta por indice UNIQUE |

### Indice adicional por GAP-003:

| Indice | Tabla | Justificacion |
|--------|-------|---------------|
| `idx_messages_latency` | messages(created_at) WHERE role='assistant' AND latency_ms IS NOT NULL | Soporte para percentiles de latencia |

## Lo que NO necesita cambios en BD

| Item | Resolucion |
|------|-----------|
| GAP-005 (last_active_at) | Subquery en app |
| RISK-001 (percentiles JSONB) | Resuelto por GAP-003 |
| RISK-002 (dashboard) | Cache con TTL en app |
| RISK-003 (filtro consentimiento) | Query derivada en app (depende de GAP-002/006) |
| RISK-004 (top keywords) | Query SQL directa, aceptable |
| RISK-005 (exportacion ARCO) | Queries paralelas en app |
| OBS-003 (severity) | Validacion Pydantic |
| OBS-005 (save_history) | Logica de negocio en servicio |
| OBS-006 (version activa) | Middleware + GAP-002 |

## Conteo final

| Metrica | Valor |
|---------|-------|
| Tablas nuevas | 2 (`system_config`, `consent_versions`) |
| Columnas nuevas | 2 (`messages.latency_ms`, `consents.revoked_at`) |
| Indices nuevos | 4 (consents, attachments, message_reports, messages-latency) |
| Total operaciones DDL | 8 (2 CREATE TABLE + 2 ALTER TABLE + 4 CREATE INDEX) |
| Items resueltos en app | 9 |
| Items sin accion | 3 |
| Total de tablas post-cambios | 13 (11 actuales + 2 nuevas) |

## SQL completo de cambios propuestos

```sql
-- ================================================
-- Migracion: Fase 3 -- Resolucion de gaps de BD
-- ================================================

-- GAP-001: Tabla de configuracion global del sistema
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- GAP-002: Tabla de versiones del documento de consentimiento
CREATE TABLE consent_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL UNIQUE,
  body_text   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_consent_versions_active
  ON consent_versions(is_active) WHERE is_active = true;

-- GAP-003: Columna de latencia por turno
ALTER TABLE messages ADD COLUMN latency_ms INT;

CREATE INDEX idx_messages_latency ON messages(created_at)
  WHERE role = 'assistant' AND latency_ms IS NOT NULL;

-- GAP-004: Indice para verificacion de consentimiento
CREATE INDEX idx_consents_user_accepted
  ON consents(user_id, accepted_at DESC);

-- GAP-006: Columna para estado de revocacion
ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP;

-- GAP-007: Indice para adjuntos por mensaje
CREATE INDEX idx_attachments_message ON attachments(message_id);

-- GAP-008: Indice para reportes por reporter
CREATE INDEX idx_message_reports_reporter ON message_reports(reporter_id);
```

## Seed de datos iniciales para system_config

```sql
-- Valores por defecto (seed de migracion)
INSERT INTO system_config (key, value) VALUES
  ('guardrail_keywords', '["suicidio","autolesion","hacerme dano","no quiero vivir","cortarme","morir"]'::jsonb),
  ('guardrail_sos_threshold', '3'::jsonb),
  ('guardrail_enabled', 'true'::jsonb),
  ('gemini_timeout_ms', '15000'::jsonb),
  ('gemini_model', '"gemini-2.5-flash"'::jsonb);
```

## Nota sobre la columna GAP-005 (last_active_at)

Se recomienda NO agregar `users.last_active_at` para MVP. La subquery `MAX(sessions.started_at)` es:
- Correcta (siempre actualizada, sin riesgo de inconsistencia).
- Performante (usa indice `idx_sessions_user_time` existente).
- Simple (sin logica adicional de sincronizacion).

Si post-MVP el numero de usuarios supera 500 y se detecta degradacion en el listado de #28, se puede agregar la columna desnormalizada con un trigger `AFTER INSERT ON sessions`.

---

> **Conclusion:** De los 19 items evaluados (8 gaps + 5 riesgos + 6 observaciones), solo 8 operaciones DDL son necesarias en BD. El resto (9 items) se resuelve integramente en la capa de aplicacion con FastAPI, Pydantic y SQLAlchemy. 3 items no requieren ninguna accion. El principio de **cambio minimo viable** se mantiene: solo se agregan las estructuras estrictamente necesarias, y se aprovecha al maximo la capa de aplicacion para derivar estados, cachear resultados, y validar datos.
