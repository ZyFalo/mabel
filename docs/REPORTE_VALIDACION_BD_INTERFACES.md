# REPORTE DEFINITIVO -- Validacion BD vs Interfaces MVP

> **Proyecto:** Mabel IA -- Asistente de Psicoeducacion para Salud Mental Estudiantil UMB
> **Agente:** 02 -- Software Architect (Arbitro)
> **Fecha:** 2026-02-23
> **Fase:** 4 -- Reporte Final de Hallazgos
> **Fuentes arbitradas:**
> - Fase 2 (Agente 03 -- Database Engineer): `docs/FASE2_MAPEO_OPERACIONES_BD.md`
> - Fase 3 (Agente 04 -- Backend Developer): `docs/FASE3_EVALUACION_CAPA_APLICACION.md`
> - DDL definitivo: `db/schema_postgresql.sql` (215 lineas, 11 tablas, Evolucion 003)
> - Catalogo de Interfaces: `docs/INTERFACES_MVP_CATALOGO.md` (42 interfaces)
> - Tech Stack: `TECHSTACK.md` (14 ADRs)

---

# Seccion 1: Resumen Ejecutivo

## Metricas globales

| Metrica | Valor |
|---------|-------|
| Interfaces analizadas | 42 |
| Interfaces con operaciones de datos | 34 |
| Interfaces sin operaciones de datos | 8 |
| Total operaciones de datos identificadas | 87 |
| Operaciones OK (cubiertas por esquema actual) | 64 (73.6%) |
| GAPS CRITICOS | 3 |
| GAPS MENORES | 5 |
| RIESGOS DE RENDIMIENTO | 5 |
| OBSERVACIONES | 6 |

## Resumen de veredictos del Arbitro

| Categoria | Total | Requiere DDL | Requiere solo App | Sin accion |
|-----------|-------|-------------|-------------------|------------|
| GAPS CRITICOS | 3 | 3 | 0 | 0 |
| GAPS MENORES | 5 | 3 | 2 | 0 |
| RIESGOS RENDIMIENTO | 5 | 0 | 4 | 1 (absorbido por GAP-003) |
| OBSERVACIONES | 6 | 0 | 3 | 3 |
| **TOTAL** | **19** | **6** | **9** | **4** |

## Cambios DDL definitivos aprobados

| Tipo | Cantidad |
|------|----------|
| Tablas nuevas | 2 (system_config, consent_versions) |
| Columnas nuevas | 2 (messages.latency_ms, consents.revoked_at) |
| Indices nuevos | 4 (consents, attachments, message_reports, messages-latency) |
| **Total operaciones DDL** | **8** |
| Tablas post-cambios | 13 (11 actuales + 2 nuevas) |
| Cobertura post-cambios | 87/87 = 100% |

---

# Seccion 2: GAPS CRITICOS

---

## GAP-001: No existe tabla para configuracion global del sistema

**ID:** GAP-001
**Interfaces afectadas:** #30 (Config del Sistema), #34 (Sidebar Admin -- indicador estado)
**Descripcion:** La interfaz #30 requiere persistir: keywords de guardrails, parametros de API Gemini (timeout, modelo), umbral de severidad SOS, y toggle global de guardrails. No existe tabla `system_config` ni equivalente.

**Solucion Agente 03 (BD):** Crear tabla `system_config` key-value con JSONB. Alternativamente tablas especializadas.
**Evaluacion Agente 04 (App vs BD):** Hibrido. BD para guardrails y parametros editables por admin; app (runtime) para estado de servicios. Confirma que env vars no cumplen requisito de hot-reload desde panel web.

### VEREDICTO FINAL: BD (tabla system_config key-value)

**Prioridad: P0 (bloqueante MVP)**

**Razonamiento del Arbitro:**

Coincido con ambos agentes en la necesidad de la tabla. El analisis del Agente 04 sobre las 4 secciones de la interfaz #30 es correcto y preciso:

| Sub-seccion | Veredicto | Justificacion |
|-------------|-----------|---------------|
| Guardrails (keywords, umbral, toggle) | BD | El admin debe editar sin reiniciar servidor |
| API Gemini (timeout, modelo) | BD | Mismo requisito de hot-reload |
| Consentimiento (texto, versiones) | BD | Resuelto por GAP-002 (tabla separada) |
| Estado del Sistema | App | Health checks en runtime, no se persisten |

**Sobre la pregunta arquitectonica "key-value generico vs tablas especializadas":** ver Seccion 9, Consideracion (a).

**DDL aprobado:**

```sql
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Impacto arquitectonico:**
- El servicio de configuracion (`ConfigService`) debe implementar cache con TTL (60s recomendado) para evitar queries en cada request al middleware de guardrails.
- Seed de datos iniciales obligatorio en la migracion Alembic.
- Toda escritura en `system_config` debe generar un registro en `audit_logs`.

---

## GAP-002: No existe tabla para versiones del documento de consentimiento

**ID:** GAP-002
**Interfaces afectadas:** #06 (Consentimiento), #22 (Consentimiento Requerido), #30 (Config Sistema -- seccion Consentimiento)
**Descripcion:** La tabla `consents` registra ACEPTACIONES del usuario, pero el TEXTO del documento de consentimiento y sus versiones no se almacenan en ninguna tabla. La interfaz #30 permite "Crear nueva version" con editor de texto; la interfaz #06 debe mostrar "el texto legal completo".

**Solucion Agente 03 (BD):** Crear tabla `consent_versions` con body_text, version UNIQUE, is_active BOOLEAN, indice parcial unico para garantizar una sola version activa.
**Evaluacion Agente 04 (App vs BD):** BD obligatoria. Argumento legal fuerte: Ley 1581/2012 y Decreto 1377/2013 exigen consentimiento auditable. Rechazo explicito de alternativas (archivo markdown versionado, almacenamiento en system_config).

### VEREDICTO FINAL: BD (tabla consent_versions dedicada)

**Prioridad: P0 (bloqueante MVP)**

**Razonamiento del Arbitro:**

Estoy completamente de acuerdo con ambos agentes. Este gap es bloqueante por tres razones independientes:

1. **Requisito legal (Ley 1581/2012):** El texto del consentimiento que el usuario acepta debe ser demostrable y auditable. Sin esta tabla, no se puede correlacionar `consents.version = "1.0"` con un texto especifico.

2. **Requisito funcional (#30):** El admin necesita crear nuevas versiones desde la interfaz web. Sin tabla, no hay donde persistir el texto creado.

3. **Requisito de integridad (#22):** Para determinar si el usuario necesita re-aceptar (nueva version disponible), el sistema necesita saber cual es la version activa. Sin tabla, esto se hardcodea.

**DDL aprobado:**

```sql
CREATE TABLE consent_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL UNIQUE,
  body_text   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Solo una version puede estar activa a la vez
CREATE UNIQUE INDEX uq_consent_versions_active
  ON consent_versions(is_active) WHERE is_active = true;
```

**Impacto arquitectonico:**
- El middleware de verificacion de consentimiento (guard de FastAPI) debe consultar `consent_versions WHERE is_active = true` en cada request autenticado. Cachear con TTL corto (30-60s).
- La creacion de nueva version debe ser transaccional: (1) desactivar version anterior, (2) insertar nueva, (3) registrar en audit_logs.
- Sobre la FK desde `consents.version`: ver Seccion 9, Consideracion (b).

---

## GAP-003: No existe columna `messages.latency_ms` para metricas de rendimiento

**ID:** GAP-003
**Interfaces afectadas:** #24 (Dashboard Admin -- KPI latencia), #27C (Metricas Tecnicas -- p50/p95/p99)
**Descripcion:** La interfaz #27C requiere calcular percentiles de latencia por dia. La latencia por turno NO se almacena en ninguna columna explicita. El campo `messages.meta` (JSONB) podria contener `{"latency_ms": 1234}` por convencion, pero esto no esta documentado ni garantizado, y `percentile_cont` sobre JSONB es ineficiente e inexable.

**Solucion Agente 03 (BD):** Agregar columna dedicada `messages.latency_ms INT` con indice parcial.
**Evaluacion Agente 04 (App vs BD):** BD recomendado. Argumento triple: (1) claridad de contrato, (2) calidad de datos, (3) costo minimo (ALTER TABLE con columna nullable no reescribe la tabla).

### VEREDICTO FINAL: BD (columna dedicada)

**Prioridad: P1 (necesario pre-MVP, no bloqueante para primeras interfaces)**

**Razonamiento del Arbitro:**

Coincido con ambos agentes, pero **bajo la prioridad de P0 a P1**. Justificacion:

- La columna `latency_ms` es necesaria para las interfaces #24 y #27C (metricas de admin), que se implementan en sprints posteriores al flujo de chat (#10).
- El chat (#10) puede funcionar sin esta columna; simplemente no se registraria la latencia.
- Sin embargo, debe agregarse ANTES de iniciar pruebas con usuarios (los datos de latencia del estudio son fundamentales para los criterios de exito: "latencia mediana <= 20s").
- Si no se agrega la columna desde el inicio, los mensajes generados antes de la migracion no tendran dato de latencia. Por pragmatismo, es mejor agregarla en la migracion inicial.

**Reclasificacion:** P1 en la ejecucion (no bloquea el inicio de desarrollo), pero DEBE estar presente antes de las pruebas piloto con estudiantes.

**DDL aprobado:**

```sql
ALTER TABLE messages ADD COLUMN latency_ms INT;

CREATE INDEX idx_messages_latency ON messages(created_at)
  WHERE role = 'assistant' AND latency_ms IS NOT NULL;
```

**Impacto arquitectonico:**
- El servicio de chat (ChatService) mide `time.monotonic()` antes y despues de la llamada al LLMProvider, y persiste el resultado en `latency_ms`.
- El calculo de percentiles usa `percentile_cont()` nativo de PostgreSQL 16, operando sobre tipo INT indexable.
- Resuelve automaticamente RISK-001.

---

# Seccion 3: GAPS MENORES

---

## GAP-004: Falta indice en consents(user_id, accepted_at DESC)

**Interfaces afectadas:** #06, #08, #09, #10, #14, #15, #22, #34B (todas las pantallas autenticadas)
**Propuesta Agente 03:** `CREATE INDEX idx_consents_user_accepted ON consents(user_id, accepted_at DESC)`
**Evaluacion Agente 04:** BD. No hay alternativa en app -- el guard de consentimiento se ejecuta en cada request.

### VEREDICTO FINAL: BD

**Prioridad: P2 (sprint 2+)**

**Razonamiento:** El indice es best practice y su creacion es instantanea. Sin embargo, con 30 usuarios y ~60 registros en `consents`, la ausencia del indice no causa degradacion medible. Lo incluyo en la Evolucion 004 pero con prioridad baja. En la practica, como es un simple `CREATE INDEX`, conviene incluirlo en la misma migracion que los demas cambios.

**DDL aprobado:**

```sql
CREATE INDEX idx_consents_user_accepted ON consents(user_id, accepted_at DESC);
```

---

## GAP-005: Falta columna `users.last_active_at`

**Interfaces afectadas:** #28 (Gestion Usuarios -- "ultimo acceso"), #29 (Detalle Usuario)
**Propuesta Agente 03:** Subquery `MAX(sessions.started_at)` como workaround; columna desnormalizada como alternativa.
**Evaluacion Agente 04:** App. Subquery es suficiente para 30 usuarios, usa indice existente `idx_sessions_user_time`.

### VEREDICTO FINAL: App (subquery)

**Prioridad: N/A (no requiere DDL)**

**Razonamiento:** Coincido con el Agente 04. La subquery correlacionada es la solucion correcta:
- Para 30 usuarios: <1ms por fila (cubierta por indice existente).
- Agregar columna desnormalizada introduce riesgo de inconsistencia y complejidad de sincronizacion innecesaria.
- Si se supera 500 usuarios post-MVP, se re-evalua.

**No se incluye en Evolucion 004.**

---

## GAP-006: Falta columna `consents.revoked_at`

**Interfaces afectadas:** #17 (Modal Revocacion), #28 (Filtro estado consentimiento), #29 (Detalle Usuario)
**Propuesta Agente 03:** `ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP`
**Evaluacion Agente 04:** BD recomendado. Costo minimo, habilita escenarios legales (derecho de oposicion parcial, Ley 1581/2012).

### VEREDICTO FINAL: BD

**Prioridad: P1 (necesario pre-MVP)**

**Razonamiento:** Coincido con ambos agentes, pero con una observacion importante:

El Agente 03 correctamente identifica que en el flujo actual de la interfaz #17, "Revocar completamente" lleva a eliminacion de cuenta. Esto significa que "Revocado" como estado persistente (usuario existe pero sin consentimiento) podria no ocurrir en la practica del MVP.

Sin embargo, agrego la columna por dos razones:
1. **Cobertura legal:** La Ley 1581/2012 contempla el derecho de oposicion parcial. El admin podria necesitar revocar el consentimiento de un usuario sin eliminar su cuenta (escenario ARCO de cancelacion).
2. **Costo vs beneficio:** ALTER TABLE con columna nullable es una operacion de costo cero en PostgreSQL.

**Pregunta para PO:** Confirmar si el estado "Revocado" en el filtro de #28 es un estado real posible o si debe simplificarse a "Vigente/Pendiente". Ver Seccion 9.

**DDL aprobado:**

```sql
ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP;
```

---

## GAP-007: Falta indice en attachments(message_id)

**Interfaces afectadas:** #10 (Chat -- audio ASR), #14 (Detalle Sesion), #40 (Exportar Datos)
**Propuesta Agente 03:** `CREATE INDEX idx_attachments_message ON attachments(message_id)`
**Evaluacion Agente 04:** BD. PostgreSQL no crea indice automatico en columnas FK; es standard practice agregarlo.

### VEREDICTO FINAL: BD

**Prioridad: P2 (sprint 2+)**

**Razonamiento:** Correcto. FK sin indice es un anti-patron conocido en PostgreSQL. El indice se crea en <1ms y es la practica estandar. Lo incluyo en la migracion con prioridad baja pero sin razon para no hacerlo.

**DDL aprobado:**

```sql
CREATE INDEX idx_attachments_message ON attachments(message_id);
```

---

## GAP-008: Falta indice en message_reports(reporter_id)

**Interfaces afectadas:** #29 (Detalle Usuario -- "Reportes realizados"), #40 (Exportar Datos)
**Propuesta Agente 03:** `CREATE INDEX idx_message_reports_reporter ON message_reports(reporter_id)`
**Evaluacion Agente 04:** BD. El indice UNIQUE existente `(message_id, reporter_id)` no cubre busquedas solo por `reporter_id`.

### VEREDICTO FINAL: BD

**Prioridad: P2 (sprint 2+)**

**Razonamiento:** Correcto. En un indice B-tree compuesto, solo la primera columna se puede usar para busquedas de igualdad sin especificar la segunda. `WHERE reporter_id = :uid` no usa `uq_message_reports_msg_user`. El indice es necesario.

**DDL aprobado:**

```sql
CREATE INDEX idx_message_reports_reporter ON message_reports(reporter_id);
```

---

# Seccion 4: RIESGOS DE RENDIMIENTO

---

## RISK-001: Percentiles de latencia sobre JSONB sin indice GIN

**Query afectada:** `percentile_cont() WITHIN GROUP (ORDER BY (meta->>'latency_ms')::NUMERIC)` en mensajes
**Volumen estimado:** ~6,000 mensajes de assistant (30 usuarios x ~10 sesiones x ~20 mensajes)
**Es problema REAL en MVP?** NO. 6,000 filas con cast JSONB: ~5-10ms. Aceptable.
**Solucion propuesta:** Se resuelve automaticamente al implementar GAP-003 (columna `latency_ms` dedicada). Con columna nativa + indice parcial, `percentile_cont` opera sobre INT indexable.

**Veredicto:** Absorbido por GAP-003. Si GAP-003 se implementa, RISK-001 desaparece.

---

## RISK-002: Queries agregadas del Dashboard Admin sin vistas materializadas

**Query afectada:** 12 queries simultaneas al cargar #24 (6 KPIs + 6 graficas)
**Volumen estimado:** <10K registros por tabla
**Es problema REAL en MVP?** NO. Cada COUNT/AVG sobre <10K filas: <5ms. 12 queries en paralelo con asyncio.gather: <50ms total.
**Solucion propuesta:** Cache con TTL (30-60s) en el servicio de dashboard (DashboardService). Sin cambios en BD.

**Veredicto:** App. Las vistas materializadas serian over-engineering para MVP. Re-evaluar post-MVP si la carga del dashboard supera 1 segundo.

---

## RISK-003: Filtro de estado de consentimiento requiere logica compleja

**Query afectada:** LEFT JOIN LATERAL con CASE para derivar estado Vigente/Pendiente/Revocado en #28
**Volumen estimado:** 30 usuarios con ~1-2 registros de consents cada uno
**Es problema REAL en MVP?** NO. La query con LATERAL es instantanea para 30 filas.
**Solucion propuesta:** La logica de derivacion de estado se implementa en el repositorio de usuarios (SQLAlchemy). Depende de GAP-002 (consent_versions para version activa) y GAP-006 (revoked_at).

**Veredicto:** App. La complejidad es de logica de negocio, no de rendimiento. Con GAP-002 y GAP-006 resueltos, la query es directa.

---

## RISK-004: Top 5 keywords de guardrails sobre JSONB no indexado

**Query afectada:** `jsonb_array_elements_text(payload->'keywords')` sobre safety_events
**Volumen estimado:** ~50-200 safety_events en el periodo del estudio
**Es problema REAL en MVP?** NO. Descomponer JSONB de 200 filas con ~2-3 keywords cada una: <5ms.
**Solucion propuesta:** Query SQL directa con `jsonb_array_elements_text`. Mantener en repositorio.

**Veredicto:** App. La query es funcional y rapida para el volumen del MVP. Post-MVP, considerar indice GIN sobre `safety_events.payload` si el volumen supera 10K eventos.

---

## RISK-005: Exportacion ARCO con JOINs multi-tabla

**Query afectada:** Recoleccion de datos de 7+ tablas para exportacion de datos personales (#40)
**Volumen estimado:** 1 usuario con sus datos asociados
**Es problema REAL en MVP?** NO. Operacion puntual, ejecutada 1 vez por peticion. Queries paralelas independientes por tabla.
**Solucion propuesta:** Servicio ARCOExportService con `asyncio.gather` ejecutando queries independientes.

**Veredicto:** App. Sin cambios en BD. El esquema actual soporta la exportacion completamente.

---

# Seccion 5: OBSERVACIONES

---

## OBS-001: #13 (Historial de Sesiones) esta DEPRECATED

**Impacto:** Ninguno en BD ni en app. La funcionalidad fue migrada al Sidebar (#34B). Las queries de listar sesiones y eliminar sesion siguen siendo las mismas.
**Accion recomendada:** Marcar #13 como deprecated en el catalogo local (`docs/INTERFACES_MVP_CATALOGO.md`). No crear ruta `/history` en FastAPI.

---

## OBS-002: #23 (Login Admin) es identico a #03 (Login)

**Impacto:** Ninguno. Un solo endpoint POST `/api/v1/auth/login`. El backend discrimina por `users.role` y retorna JWT con claim "role".
**Accion recomendada:** Sin accion.

---

## OBS-003: Ambiguedad en campo `severity` de safety_events

**Impacto:** La interfaz #25 filtra por severidad, pero `safety_events` no tiene columna `severity`. La severidad vive en `payload JSONB`.
**Accion recomendada:** Resolver en app con validacion Pydantic del payload (SafetyEventPayload con `severity: int = Field(ge=1, le=5)`). Query de filtro: `(payload->>'severity')::INT = :severity`. NO agregar columna dedicada porque duplicaria datos del payload e introduce riesgo de inconsistencia.

**Nota del Arbitro:** Coincido con el Agente 04. La severidad es un atributo del payload del evento, no una propiedad estructural de la tabla. Forzar su estructura en Pydantic es la capa correcta.

---

## OBS-004: Tiempo promedio de resolucion de reportes

**Impacto:** Ninguno. La query `AVG(updated_at - created_at)` sobre `message_reports WHERE status = 'resolved'` funciona correctamente con las columnas existentes.
**Accion recomendada:** Sin accion. Implementar la query tal como esta documentada.

---

## OBS-005: `save_history` controla persistencia de mensajes pero NO de sesiones

**Impacto:** Logica de negocio. Cuando `save_history = FALSE`, las sesiones SI existen pero sin mensajes.
**Accion recomendada:** Implementar en el servicio de chat (ChatService): si `save_history = FALSE`, no ejecutar INSERT en messages pero SI crear session. El frontend verifica `preferences.save_history` para decidir si muestra historial o empty state en #34B.

---

## OBS-006: Patron "Consentimiento Requerido" (#22) depende de version activa

**Impacto:** Sin GAP-002, la version activa seria hardcodeada. Con GAP-002, el middleware consulta `consent_versions WHERE is_active = true`.
**Accion recomendada:** Se resuelve automaticamente al implementar GAP-002. El middleware de consentimiento (ConsentGuard) compara `consents.version` del usuario con la version activa de `consent_versions`.

---

# Seccion 6: Cobertura por Tabla

---

## 6.1 Tablas actuales (11)

### users (14 operaciones)

| Interfaces | #02, #03, #05, #08, #15, #16, #23, #24, #28, #29, #33, #40, #42 |
|------------|------------------------------------------------------------------|
| Operaciones | INSERT registro, SELECT login, UPDATE password, SELECT display_name, SELECT email, UPDATE soft-delete, COUNT total, SELECT listado, UPDATE deshabilitar, SELECT detalle, SELECT header, SELECT exportacion, UPDATE cambiar password, SELECT filtro consentimiento |
| Gaps asociados | GAP-005 (last_active_at) -- resuelto en App con subquery |
| Cobertura | 14/14 = 100% (con subquery para last_active_at) |

### consents (8 operaciones)

| Interfaces | #06, #08, #15, #17, #22, #28, #29, #40 |
|------------|----------------------------------------|
| Operaciones | INSERT aceptar, SELECT verificar vigente (x3), UPDATE revocar scope, SELECT filtrar por estado, SELECT mostrar consent, SELECT exportacion |
| Gaps asociados | GAP-004 (indice), GAP-006 (revoked_at) |
| Cobertura actual | 6/8 = 75% (falta indice y revoked_at) |
| Cobertura post-Evo004 | 8/8 = 100% |

### preferences (7 operaciones)

| Interfaces | #07, #08, #09, #10, #15, #29, #40 |
|------------|-----------------------------------|
| Operaciones | INSERT/UPSERT inicial, SELECT save_history, SELECT checkin_enabled, SELECT preferred_chat_mode, SELECT todas, UPDATE preferencias, SELECT estado admin |
| Gaps asociados | Ninguno |
| Cobertura | 7/7 = 100% |

### sessions (12 operaciones)

| Interfaces | #08, #09, #10, #14, #18, #24, #27A, #27B, #29, #34B |
|------------|------------------------------------------------------|
| Operaciones | INSERT crear, PATCH checkin, PATCH finalizar, PATCH avatar_used, SELECT detalle, DELETE eliminar, SELECT resumen, COUNT hoy, SELECT uso por dia, SELECT checkin data, COUNT por usuario, SELECT historial sidebar |
| Gaps asociados | Ninguno |
| Cobertura | 12/12 = 100% |

### messages (10 operaciones)

| Interfaces | #10, #11, #14, #24, #27A, #27C, #27D, #40 |
|------------|---------------------------------------------|
| Operaciones | INSERT mensaje usuario, INSERT respuesta asistente (con latency_ms), SELECT historial, SELECT conversacion, AVG mensajes, COUNT por sesion, percentiles latencia, SUM tokens, safety_flags analysis, COUNT exportacion |
| Gaps asociados | GAP-003 (latency_ms) |
| Cobertura actual | 8/10 = 80% (falta latency_ms para INSERT respuesta y percentiles) |
| Cobertura post-Evo004 | 10/10 = 100% |

### message_reports (6 operaciones)

| Interfaces | #11, #24, #26, #29, #40 |
|------------|------------------------|
| Operaciones | INSERT crear reporte, SELECT verificar duplicado, COUNT pendientes, SELECT listado paginado, PATCH cambiar estado, COUNT por reporter |
| Gaps asociados | GAP-008 (indice reporter_id) |
| Cobertura actual | 5/6 = 83% (query funciona pero sin indice) |
| Cobertura post-Evo004 | 6/6 = 100% |

### attachments (3 operaciones)

| Interfaces | #10, #14, #40 |
|------------|---------------|
| Operaciones | INSERT adjunto audio, SELECT adjuntos de sesion, COUNT exportacion |
| Gaps asociados | GAP-007 (indice message_id) |
| Cobertura actual | 2/3 = 67% (query funciona pero sin indice) |
| Cobertura post-Evo004 | 3/3 = 100% |

### safety_events (8 operaciones)

| Interfaces | #10, #11, #12, #24, #25, #27D, #29, #34, #40 |
|------------|------------------------------------------------|
| Operaciones | INSERT evento crisis, INSERT evento reporte, COUNT 24h, SELECT listado paginado, PATCH cambiar estado, SELECT por dia, SELECT top keywords, COUNT por usuario |
| Gaps asociados | OBS-003 (severity en payload -- resuelto en App) |
| Cobertura | 8/8 = 100% (con convencion de payload JSONB) |

### password_reset_tokens (3 operaciones)

| Interfaces | #04, #05 |
|------------|----------|
| Operaciones | INSERT crear token, SELECT validar token, UPDATE marcar usado |
| Gaps asociados | Ninguno |
| Cobertura | 3/3 = 100% |

### audit_logs (4 operaciones)

| Interfaces | #25, #26, #28, #30, #31 |
|------------|------------------------|
| Operaciones | INSERT accion admin (implicito en toda accion admin), SELECT listado paginado, SELECT filtrar por admin, SELECT exportar CSV |
| Gaps asociados | Ninguno |
| Cobertura | 4/4 = 100% |

### survey_responses (3 operaciones)

| Interfaces | #24, #27E |
|------------|-----------|
| Operaciones | AVG SUS score, SELECT metricas agregadas, POST importar resultados |
| Gaps asociados | Ninguno |
| Cobertura | 3/3 = 100% |

## 6.2 Tablas nuevas propuestas (2)

### system_config (4 operaciones previstas)

| Interfaces | #30, #34 |
|------------|----------|
| Operaciones previstas | SELECT config de guardrails, UPDATE config de guardrails, SELECT config Gemini, UPDATE config Gemini |
| Gaps asociados | GAP-001 (esta tabla es la solucion) |
| Cobertura post-Evo004 | 4/4 = 100% |

### consent_versions (4 operaciones previstas)

| Interfaces | #06, #22, #28, #30 |
|------------|---------------------|
| Operaciones previstas | SELECT texto activo para #06, SELECT version activa para guard #22, SELECT version activa para filtro #28, INSERT nueva version desde #30 |
| Gaps asociados | GAP-002 (esta tabla es la solucion) |
| Cobertura post-Evo004 | 4/4 = 100% |

## 6.3 Resumen de cobertura

| Tabla | Operaciones | Cobertura actual | Cobertura post-Evo004 |
|-------|-------------|------------------|-----------------------|
| users | 14 | 100% | 100% |
| consents | 8 | 75% | 100% |
| preferences | 7 | 100% | 100% |
| sessions | 12 | 100% | 100% |
| messages | 10 | 80% | 100% |
| message_reports | 6 | 83% | 100% |
| attachments | 3 | 67% | 100% |
| safety_events | 8 | 100% | 100% |
| password_reset_tokens | 3 | 100% | 100% |
| audit_logs | 4 | 100% | 100% |
| survey_responses | 3 | 100% | 100% |
| system_config | 4 | 0% (no existe) | 100% |
| consent_versions | 4 | 0% (no existe) | 100% |
| **TOTAL** | **86** | **64/86 = 74.4%** | **86/86 = 100%** |

**Nota:** El total difiere ligeramente del conteo del Agente 03 (87 operaciones) porque la operacion #87 (la query de filtro de consentimiento en #28) se cuenta como parte de la operacion de `consents` y `consent_versions` conjuntamente. La diferencia es de clasificacion, no de cobertura.

---

# Seccion 7: Interfaces sin Gaps

Las siguientes interfaces estan 100% cubiertas por el esquema actual (sin necesitar ningun cambio de Evolucion 004):

| # | Interfaz | Operaciones | Tabla(s) principal(es) |
|---|----------|-------------|----------------------|
| #01 | Landing / Bienvenida | 0 (estatica) | N/A |
| #02 | Registro | 1 | users |
| #03 | Login | 1 | users |
| #04 | Recuperar Contrasena | 1 | password_reset_tokens |
| #05 | Restablecer Contrasena | 2 | password_reset_tokens, users |
| #07 | Onboarding Preferencias | 1 | preferences |
| #08 | Home | 3 | users, consents, preferences, sessions |
| #09 | Check-in | 2 | preferences, sessions |
| #10 | Chat Principal | 5 | sessions, messages, attachments, safety_events, preferences |
| #11 | Reportar Mensaje | 3 | message_reports, safety_events |
| #12 | SOS / Crisis | 1 | safety_events |
| #14 | Detalle de Sesion | 3 | sessions, messages, attachments |
| #15 | Preferencias | 4 | users, consents, preferences |
| #16 | Eliminar Cuenta | 1 | users |
| #18 | Chat Avatar | 1 | sessions |
| #19 | Error 404 | 0 (estatica) | N/A |
| #20 | Error de Conexion | 0 (estatica) | N/A |
| #21 | Sesion Expirada | 0 (estatica) | N/A |
| #23 | Login Admin (= #03) | 0 | N/A (identica a #03) |
| #24 | Dashboard Admin | 6 | users, sessions, safety_events, message_reports, messages, survey_responses |
| #25 | Panel Safety Events | 3 | safety_events, audit_logs |
| #26 | Panel Reportes | 3 | message_reports, audit_logs |
| #29 | Detalle Usuario | 5 | users, consents, preferences, sessions, safety_events, message_reports |
| #31 | Panel Logs Auditoria | 3 | audit_logs |
| #32 | Acceso Denegado 403 | 0 (estatica) | N/A |
| #33 | Header | 1 | users |
| #34B | Sidebar Estudiante | 2 | sessions, preferences |
| #35 | Footer | 0 (estatica) | N/A |
| #36 | Toast / Notificaciones | 0 (UI pura) | N/A |
| #37 | Modal de Confirmacion | 0 (UI pura) | N/A |
| #38 | Skeleton Loaders | 0 (UI pura) | N/A |
| #42 | Modal Cambio Contrasena | 1 | users |

**Total: 32 interfaces sin gaps** (de 42 totales).

Las 10 interfaces que REQUIEREN cambios de Evolucion 004:

| # | Interfaz | Gap(s) requerido(s) |
|---|----------|---------------------|
| #06 | Consentimiento | GAP-002 (consent_versions) |
| #17 | Modal Revocacion | GAP-006 (revoked_at) |
| #22 | Consentimiento Requerido | GAP-002 (consent_versions) |
| #27C | Metricas Tecnicas | GAP-003 (latency_ms) |
| #28 | Gestion Usuarios | GAP-004 (indice), GAP-006 (revoked_at), GAP-008 (indice) |
| #30 | Config del Sistema | GAP-001 (system_config), GAP-002 (consent_versions) |
| #34 | Sidebar Admin | GAP-001 (system_config -- indicador estado) |
| #40 | Exportar Datos | GAP-007 (indice attachments), GAP-008 (indice reporter) |
| #27A | Metricas de Uso | Ninguno critico, pero se beneficia de GAP-003 |
| #27D | Metricas de Seguridad | Ninguno critico (RISK-004 aceptable) |

---

# Seccion 8: Propuesta de Evolucion 004

```
PROPUESTA -- Evolucion 004 (NO EJECUTAR -- SOLO PROPUESTA)
Estado: Pendiente aprobacion del PO
Generada por: Agente 02 (Software Architect) como arbitro de Fase 2 y Fase 3
Fecha: 2026-02-23
```

```
+-----+---------------------------------------------+----------------+----------------------------------------------+
| #   | Cambio                                      | Tipo           | Justificacion                                |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 1   | Crear tabla system_config                   | CREATE TABLE   | GAP-001: Config editable por admin (#30)     |
|     |                                             |                | sin reiniciar servidor                       |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 2   | Crear tabla consent_versions                | CREATE TABLE   | GAP-002: Texto versionado del consentimiento |
|     |                                             |                | Ley 1581/2012. Interfaces #06, #22, #30      |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 3   | Indice unico parcial en consent_versions    | CREATE INDEX   | GAP-002: Solo 1 version activa a la vez      |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 4   | Columna messages.latency_ms                 | ALTER TABLE    | GAP-003: Metricas percentiles #24, #27C      |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 5   | Indice parcial messages(created_at)         | CREATE INDEX   | GAP-003: Soporte para percentile_cont        |
|     | WHERE role='assistant' AND latency_ms       |                |                                              |
|     | IS NOT NULL                                 |                |                                              |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 6   | Indice consents(user_id, accepted_at DESC)  | CREATE INDEX   | GAP-004: Guard de consentimiento             |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 7   | Columna consents.revoked_at                 | ALTER TABLE    | GAP-006: Estado "Revocado" para filtros      |
|     |                                             |                | y escenarios legales                         |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 8   | Indice attachments(message_id)              | CREATE INDEX   | GAP-007: FK sin indice implicito             |
+-----+---------------------------------------------+----------------+----------------------------------------------+
| 9   | Indice message_reports(reporter_id)         | CREATE INDEX   | GAP-008: Busqueda por reporter               |
+-----+---------------------------------------------+----------------+----------------------------------------------+
```

## DDL completo de la Evolucion 004

```sql
-- =============================================================
-- Mabel IA -- Evolucion 004: Resolucion de Gaps BD vs Interfaces
-- Motor: PostgreSQL 16
-- Generado por: Agente 02 (Software Architect) -- Fase 4 Arbitraje
-- Fecha: 2026-02-23
-- Estado: PROPUESTA -- NO EJECUTAR sin aprobacion del PO
-- Origen: REPORTE_VALIDACION_BD_INTERFACES.md
-- =============================================================
-- Prerequisitos: Evolucion 003 aplicada (esquema de 11 tablas)
-- Cambios: 2 tablas nuevas, 2 columnas nuevas, 5 indices nuevos
-- Post-cambio: 13 tablas totales
-- =============================================================

-- -----------------------------------------------
-- GAP-001: Tabla de configuracion global del sistema
-- Interfaces: #30 (Config del Sistema), #34 (Sidebar Admin)
-- Prioridad: P0 (bloqueante MVP)
-- -----------------------------------------------

CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed de valores por defecto (ejecutar en la misma migracion)
INSERT INTO system_config (key, value) VALUES
  ('guardrail_keywords', '["suicidio","autolesion","hacerme dano","no quiero vivir","cortarme","morir"]'::jsonb),
  ('guardrail_sos_threshold', '3'::jsonb),
  ('guardrail_enabled', 'true'::jsonb),
  ('gemini_timeout_ms', '15000'::jsonb),
  ('gemini_model', '"gemini-2.5-flash"'::jsonb);

-- -----------------------------------------------
-- GAP-002: Tabla de versiones del documento de consentimiento
-- Interfaces: #06, #22, #28, #30
-- Prioridad: P0 (bloqueante MVP)
-- Justificacion legal: Ley 1581/2012, Decreto 1377/2013
-- -----------------------------------------------

CREATE TABLE consent_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL UNIQUE,
  body_text   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Solo una version puede estar activa a la vez
CREATE UNIQUE INDEX uq_consent_versions_active
  ON consent_versions(is_active) WHERE is_active = true;

-- -----------------------------------------------
-- GAP-003: Columna de latencia por turno de respuesta
-- Interfaces: #24 (KPI latencia), #27C (percentiles p50/p95/p99)
-- Prioridad: P1 (necesario pre-MVP, no bloquea primeros sprints)
-- -----------------------------------------------

ALTER TABLE messages ADD COLUMN latency_ms INT;

CREATE INDEX idx_messages_latency ON messages(created_at)
  WHERE role = 'assistant' AND latency_ms IS NOT NULL;

-- -----------------------------------------------
-- GAP-004: Indice para verificacion de consentimiento vigente
-- Interfaces: #06, #08, #09, #10, #14, #15, #22, #34B
-- Prioridad: P2 (best practice)
-- -----------------------------------------------

CREATE INDEX idx_consents_user_accepted
  ON consents(user_id, accepted_at DESC);

-- -----------------------------------------------
-- GAP-006: Columna para estado de revocacion de consentimiento
-- Interfaces: #17, #28, #29
-- Prioridad: P1 (necesario para filtros y cumplimiento legal)
-- Nota: Verificar con PO si estado "Revocado" aplica en MVP
-- -----------------------------------------------

ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP;

-- -----------------------------------------------
-- GAP-007: Indice para adjuntos por mensaje
-- Interfaces: #10, #14, #40
-- Prioridad: P2 (standard practice para FK sin indice)
-- -----------------------------------------------

CREATE INDEX idx_attachments_message ON attachments(message_id);

-- -----------------------------------------------
-- GAP-008: Indice para reportes por reporter
-- Interfaces: #29, #40
-- Prioridad: P2 (el indice UNIQUE existente no cubre esta busqueda)
-- -----------------------------------------------

CREATE INDEX idx_message_reports_reporter ON message_reports(reporter_id);
```

## Estado post-Evolucion 004

| Metrica | Antes (Evo 003) | Despues (Evo 004) | Delta |
|---------|-----------------|-------------------|-------|
| Tablas | 11 | 13 | +2 |
| Columnas totales | 71 | 76 | +5 |
| CHECK constraints | 11 | 12 | +1 (preferred_chat_mode ya contado en Evo003; se suma el nuevo check implicito en consent_versions via UNIQUE) |
| Indices explicitos | 14 | 19 | +5 |
| UNIQUE constraints/indices | 4 | 6 | +2 (consent_versions.version + uq_consent_versions_active) |
| Foreign Keys | 15 | 18 | +3 (system_config.updated_by, consent_versions.created_by, consent_versions via indice parcial no es FK) |

**Correccion de conteo de FK:**
- system_config.updated_by -> users(id): +1
- consent_versions.created_by -> users(id): +1
- Total FK post-Evo004: 17

---

# Seccion 9: Preguntas para el PO y Consideraciones Arquitectonicas

---

## Preguntas para el PO

### PO-Q1: Estado "Revocado" en el filtro de #28

La interfaz #28 especifica un filtro con tres estados: "Vigente/Pendiente/Revocado". Sin embargo, en el flujo actual de la interfaz #17 (Modal Revocacion):
- Opcion 1: Bajar scope (no es revocacion, es cambio de scope)
- Opcion 2: Revocar completamente -> elimina la cuenta (CASCADE)

Si la revocacion total siempre lleva a eliminacion de cuenta, entonces el estado "Revocado" no existiria en la practica y el filtro deberia ser solo "Vigente/Pendiente".

**Pregunta:** Puede un usuario existir con consentimiento revocado (sin eliminar su cuenta)? O el filtro de #28 deberia simplificarse a "Vigente/Pendiente"?

**Impacto de la respuesta:**
- Si "Revocado" es un estado real: mantener GAP-006 como esta.
- Si no es posible: GAP-006 sigue siendo recomendado (cobertura legal), pero se puede bajar la prioridad y simplificar el filtro en el frontend.

### PO-Q2: Seed del texto de consentimiento inicial

La tabla `consent_versions` (GAP-002) necesita al menos un registro inicial con el texto del consentimiento informado. Este texto debe cumplir con la Ley 1581/2012 y el Decreto 1377/2013.

**Pregunta:** Existe ya un borrador del texto de consentimiento informado para el estudio? Se debe incluir como seed en la migracion inicial, o el admin lo creara desde la interfaz #30 despues del despliegue?

**Impacto de la respuesta:**
- Si existe borrador: incluir como seed SQL en la migracion.
- Si no existe: la interfaz #30 (crear version) debe ser funcional antes de que cualquier estudiante pueda usar el sistema.

### PO-Q3: Keywords de guardrails -- lista inicial

El seed propuesto para `system_config` incluye una lista basica de keywords de crisis en espanol. Esta lista debe ser validada por profesionales de salud mental.

**Pregunta:** La lista de keywords de crisis debe ser revisada/ampliada por un profesional antes del despliegue piloto? Quien es responsable de definir la lista final?

---

## Consideraciones Arquitectonicas

### (a) system_config como key-value generico vs tablas especializadas

**Pregunta evaluada:** Es correcto usar una tabla key-value generica (`system_config`) en lugar de tablas especializadas (`guardrail_keywords`, `gemini_config`, etc.)?

**Veredicto del Arbitro: Key-value generico es CORRECTO para el MVP.**

Argumentos a favor del key-value generico:

1. **Simplicidad:** Una sola tabla con 4 columnas vs 2-3 tablas con 5-8 columnas cada una. Menos migraciones, menos repositorios, menos endpoints.

2. **Flexibilidad:** Si el admin necesita agregar un nuevo parametro (ej: `tts_default_voice`, `checkin_prompt_text`), se agrega un INSERT, no un ALTER TABLE.

3. **Volumetria:** El MVP tendra ~5-10 keys de configuracion. No justifica tablas especializadas.

4. **Tipado seguro en app:** Pydantic valida la estructura del value JSONB al leer/escribir. El tipado no se pierde; simplemente se mueve de BD a app.

Argumentos a favor de tablas especializadas:

1. **Integridad referencial:** Una tabla `guardrail_keywords` podria tener FK a categorias. Pero para el MVP, las keywords son una lista plana en JSONB.

2. **Queries de filtro:** Si se necesita `WHERE category = 'crisis'`, una tabla relacional es mas eficiente. Pero con <50 keywords, el filtro en Python es trivial.

**Excepcion: `consent_versions` SI debe ser tabla separada.** El texto del consentimiento no es una "configuracion" -- es un documento legal versionado con historial, auditoria, y FK implicita desde `consents`. Almacenarlo como un value JSONB en `system_config` perderia la capacidad de versionado y auditoria.

**Recomendacion final:** `system_config` key-value para guardrails, parametros Gemini, y configuraciones simples. `consent_versions` como tabla dedicada. Si post-MVP los guardrails crecen a >100 keywords con categorias y metadata, migrar a tabla `guardrail_keywords` dedicada.

---

### (b) FK desde `consents.version` hacia `consent_versions.version`

**Pregunta evaluada:** Si `consent_versions.version` es UNIQUE, deberia existir una FK `consents.version -> consent_versions.version`?

**Veredicto del Arbitro: NO agregar FK. Mantener acoplamiento suave.**

Argumentos en contra de la FK:

1. **Orden de datos:** La tabla `consent_versions` se crea en Evolucion 004. Los registros existentes en `consents` tendrian `version = "1.0"` pero no existiria un registro `consent_versions` con esa version. La FK seria violada inmediatamente a menos que se cree un backfill.

2. **Acoplamiento excesivo:** Si el admin crea `consent_versions` con version "2.0" y luego la elimina (correccion de error), la FK impediria el DELETE si algun usuario ya la acepto. Esto esta bien semanticamente (no se deberia eliminar una version que alguien acepto), pero en la practica el admin podria necesitar corregir errores.

3. **El valor es TEXT, no UUID:** Las FK sobre TEXT son fragiles (case sensitivity, trailing spaces). La correlacion se hace en la capa de aplicacion.

**Alternativa recomendada:** Validacion en la capa de aplicacion. El servicio de consentimiento verifica que `version` exista en `consent_versions` antes de hacer INSERT en `consents`. Si no existe, rechaza la operacion con error 400.

---

### (c) Impacto en los 15 agentes: "11 tablas" hardcodeado

**Pregunta evaluada:** La migracion de 11 a 13 tablas rompe el "Contexto del Proyecto" de los 15 agentes?

**Veredicto del Arbitro: SI, requiere actualizacion, pero NO es bloqueante.**

Los siguientes archivos/documentos mencionan "11 tablas":

| Archivo | Ubicacion del dato | Accion necesaria |
|---------|-------------------|------------------|
| `CLAUDE.md` | "11 tables in PostgreSQL 16" | Actualizar a "13 tables" post-Evo004 |
| `.claude/agents/AGENT_*.md` | Multiples agentes referencian "11 tablas" | Actualizar los que lo mencionan |
| `TECHSTACK.md` | "8 tablas" (desactualizado desde Evo002, ya deberia decir 11) | Actualizar a "13 tables" |
| `docs/DB_SCHEMA_EVOLUTION_002.md` | "Estado Post-Cambio: 11 tablas" | Correcto para su fecha; no modificar |
| Notion pages | Multiples referencias | Actualizar al aprobar Evo004 |

**Recomendacion:** Crear una tarea de actualizacion de documentacion DESPUES de ejecutar Evo004, no antes. No vale la pena actualizar documentos para una propuesta que aun no esta aprobada.

**Riesgo real:** Bajo. Los agentes usan el DDL (`db/schema_postgresql.sql`) como fuente de verdad, no los conteos hardcodeados en su contexto. El numero "11" es metadata informativa, no operativa.

---

### (d) Operaciones de datos potencialmente omitidas

**Pregunta evaluada:** Hay operaciones que los Agentes 03/04 pudieron haber omitido?

He revisado las siguientes areas que no aparecen en los reportes:

**1. Tokens de sesion JWT -- necesitan tabla?**

No. Los JWT son stateless por diseno (ADR del TECHSTACK.md). El token se genera en login, se firma con una secret key, y se valida en cada request sin consultar BD. No se necesita tabla de sesiones JWT ni tabla de refresh tokens.

Si en el futuro se necesita blacklisting de tokens (ej: logout global, revocar sesion desde admin), se puede usar un cache en memoria (set de JTI revocados) con TTL igual al tiempo de expiracion del token. Para el MVP con 30 usuarios y sesiones de 1-2 horas, la expiracion natural del JWT es suficiente.

**2. Rate limiting -- persistido o en memoria?**

En memoria. El rate limiting del MVP (proteger contra abuso de la API Gemini) se implementa con un middleware de FastAPI usando un diccionario en memoria o una libreria como `slowapi`. Con 30 usuarios y 1 instancia, no necesita persistencia. Para post-MVP con multiples instancias, se podria usar Redis, pero eso no requiere tabla en PostgreSQL.

**3. Logs de errores de aplicacion**

No requieren tabla en BD. Los errores de aplicacion se loguean a stdout/stderr con `structlog` (definido en TECHSTACK.md). En desarrollo se ven en la terminal; en Railway se ven en el dashboard de logs. No se persisten en PostgreSQL.

**4. Cache de respuestas del LLM**

No aplica para MVP. Cada interaccion es unica (depende del contexto de la sesion). No hay patron de cache de respuestas que tenga sentido en un chatbot de salud mental.

**5. Cola de tareas asincronas (procesamiento de audio)**

El procesamiento de audio (ASR con faster-whisper) se ejecuta sincronamente en el request. Para el MVP con 30 usuarios concurrentes bajos, no se necesita cola (Celery/RQ). Si la latencia de ASR supera los limites post-MVP, se puede agregar cola con Redis, pero eso no afecta el esquema PostgreSQL.

**Conclusion:** No se identifican operaciones de datos omitidas que requieran cambios en el esquema.

---

### (e) Impacto en Alembic: una o multiples migraciones?

**Pregunta evaluada:** La Evolucion 004 se puede implementar como UNA sola migracion Alembic o necesita ser dividida?

**Veredicto del Arbitro: UNA sola migracion es SUFICIENTE y PREFERIBLE.**

Argumentos:

1. **Independencia de operaciones:** Todas las operaciones DDL de Evo004 son aditivas (CREATE TABLE, ALTER TABLE ADD COLUMN, CREATE INDEX). Ninguna modifica o elimina datos existentes. No hay riesgo de perdida de datos.

2. **Orden de dependencias dentro de la migracion:**
   - `system_config` depende de `users` (FK updated_by) -- ya existe.
   - `consent_versions` depende de `users` (FK created_by) -- ya existe.
   - `messages.latency_ms` no tiene dependencias.
   - Los indices no tienen dependencias entre si.
   - Conclusion: todas las operaciones se pueden ejecutar en cualquier orden.

3. **Atomicidad:** PostgreSQL ejecuta DDL transaccionalmente. Si cualquier operacion falla, TODA la migracion se revierte. Esto es deseable: la Evo004 es un bloque coherente de cambios.

4. **Simplicidad operativa:** Una sola migracion = un solo `alembic upgrade head`. Dividir en multiples migraciones introduce complejidad de coordinacion sin beneficio.

**Estructura recomendada del archivo Alembic:**

```python
"""Evolucion 004: Resolucion de gaps BD vs Interfaces MVP

Revision ID: 004_resolve_gaps
Revises: 003_avatar_3d
Create Date: 2026-02-XX

Changes:
- GAP-001: CREATE TABLE system_config
- GAP-002: CREATE TABLE consent_versions + partial unique index
- GAP-003: ALTER TABLE messages ADD COLUMN latency_ms + partial index
- GAP-004: CREATE INDEX idx_consents_user_accepted
- GAP-006: ALTER TABLE consents ADD COLUMN revoked_at
- GAP-007: CREATE INDEX idx_attachments_message
- GAP-008: CREATE INDEX idx_message_reports_reporter
"""

def upgrade():
    # GAP-001
    op.create_table('system_config', ...)
    # Seed
    op.execute("INSERT INTO system_config ...")
    # GAP-002
    op.create_table('consent_versions', ...)
    op.create_index('uq_consent_versions_active', ...)
    # GAP-003
    op.add_column('messages', sa.Column('latency_ms', sa.Integer))
    op.create_index('idx_messages_latency', ...)
    # GAP-004
    op.create_index('idx_consents_user_accepted', ...)
    # GAP-006
    op.add_column('consents', sa.Column('revoked_at', sa.DateTime))
    # GAP-007
    op.create_index('idx_attachments_message', ...)
    # GAP-008
    op.create_index('idx_message_reports_reporter', ...)

def downgrade():
    # Reverse order
    op.drop_index('idx_message_reports_reporter')
    op.drop_index('idx_attachments_message')
    op.drop_column('consents', 'revoked_at')
    op.drop_index('idx_consents_user_accepted')
    op.drop_index('idx_messages_latency')
    op.drop_column('messages', 'latency_ms')
    op.drop_index('uq_consent_versions_active')
    op.drop_table('consent_versions')
    op.drop_table('system_config')
```

**Excepcion:** Si el PO decide que alguno de los cambios P1/P2 no se aprueba (ej: GAP-006 revoked_at se pospone por la pregunta PO-Q1), entonces se debe dividir en 2 migraciones: una con los cambios aprobados P0, otra con los P1/P2 cuando se aprueben. Pero esto es una decision del PO, no tecnica.

---

# Apendice A: Concordancia entre Agentes

## Coincidencias entre Agente 03 y Agente 04

Los dos agentes coinciden en:

| Item | Agente 03 | Agente 04 | Arbitro |
|------|-----------|-----------|---------|
| system_config necesaria | SI | SI | SI |
| consent_versions necesaria | SI | SI | SI |
| messages.latency_ms como columna | SI | SI | SI |
| consents.revoked_at recomendado | SI | SI | SI |
| last_active_at NO como columna | Ambos (subquery) | SI | SI |
| Indices GAP-004/007/008 | SI | SI | SI |
| RISK-002 cache en app | N/A | SI | SI |
| OBS-003 Pydantic | N/A | SI | SI |

## Discrepancias entre agentes

| Item | Agente 03 | Agente 04 | Arbitro |
|------|-----------|-----------|---------|
| GAP-001 alcance | Sugiere tablas especializadas como alternativa | Confirma key-value unico | Key-value para MVP, consent_versions separada |
| GAP-003 prioridad | P1 (critico) | P1 (recomendado) | P1 (necesario pre-pruebas, no bloqueante sprint 1) |
| Conteo de operaciones | 87 | N/A | 86 (diferencia de clasificacion menor) |

No se identificaron discrepancias significativas entre los reportes de Fase 2 y Fase 3. El trabajo de ambos agentes es consistente, complementario, y de alta calidad.

---

# Apendice B: Checklist de Validacion del Arbitro

- [x] Leido DDL completo (215 lineas, 11 tablas, Evo003)
- [x] Leido Fase 2 completa (908 lineas)
- [x] Leido Fase 3 completa (1031 lineas)
- [x] Verificado conteo de operaciones (87 del Agente 03)
- [x] Verificado clasificacion de gaps (3 criticos, 5 menores)
- [x] Verificado que soluciones propuestas no violan patrones arquitectonicos (Repository, Service, Middleware)
- [x] Verificado compatibilidad con Alembic
- [x] Verificado que system_config respeta patron de capa de abstraccion LLM (los parametros de Gemini en system_config son consumidos por ConfigService, no directamente por GeminiAdapter)
- [x] Verificado que consent_versions no viola privacidad por diseno
- [x] Verificado que no se requieren tablas adicionales para JWT, rate limiting, o logs de error
- [x] Verificado que DDL propuesto es ejecutable en PostgreSQL 16
- [x] Evaluadas las 5 consideraciones arquitectonicas especiales (a-e)
- [x] Identificadas 3 preguntas para el PO

---

> **Firma del Arbitro:**
> Agente 02 -- Software Architect
> Proyecto Mabel IA
> 2026-02-23
>
> **Proximo paso:** Presentar este reporte al PO (Agente 01 / Product Owner) para aprobacion de la Evolucion 004 y respuesta a las preguntas PO-Q1, PO-Q2, PO-Q3. Una vez aprobado, el Agente 03 ejecuta la migracion y el Agente 04 implementa los servicios de aplicacion correspondientes.
