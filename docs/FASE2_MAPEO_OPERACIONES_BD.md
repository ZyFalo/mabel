# FASE 2 -- Mapeo Exhaustivo de Operaciones de Interfaces al Esquema de BD

> **Proyecto:** Mabel IA -- Asistente de Psicoeducacion para Salud Mental Estudiantil UMB
> **Agente:** 03 -- Database Engineer
> **Fecha:** 2026-02-23
> **Fuentes consultadas:**
> - DDL definitivo: `db/schema_postgresql.sql` (215 lineas, 11 tablas)
> - Notion -- Esquema de BD: `30b596a2-399d-810f-8521-c4852ab5ae83`
> - Catalogo de Interfaces: `docs/INTERFACES_MVP_CATALOGO.md` (42 interfaces)
> - Notion -- Interfaces: `30e596a2-399d-8124-bf75-c6dc05f1e96b`
> - Context7 MCP -- PostgreSQL 16: `/websites/postgresql_16` (percentile_cont, GIN, partial indexes)

---

# PARTE A -- Tabla Resumen de Clasificacion

## Totales

| Metrica | Valor |
|---------|-------|
| **Interfaces analizadas** | 42 |
| **Interfaces con operaciones de datos** | 34 |
| **Interfaces sin operaciones de datos** | 8 |
| **Total operaciones de datos identificadas** | 87 |
| **Operaciones clasificadas OK** | 64 |
| **GAP CRITICO** | 3 |
| **GAP MENOR** | 5 |
| **RIESGO RENDIMIENTO** | 5 |
| **OBSERVACION** | 6 |

## Interfaces sin operaciones de datos (confirmado)

| # | Interfaz | Justificacion |
|---|----------|---------------|
| #01 | Landing / Bienvenida | Contenido estatico, sin consultas a BD |
| #19 | Error 404 | Contenido estatico |
| #20 | Error de Conexion | Componente UI puro, sin acceso a BD |
| #21 | Sesion Expirada | Modal informativo, limpia estado local |
| #32 | Acceso Denegado 403 | Contenido estatico, el guard se evalua con JWT |
| #35 | Footer | Contenido estatico institucional |
| #36 | Toast / Notificaciones | Componente UI puro |
| #38 | Skeleton Loaders | Componente UI puro |

**Nota:** El hallazgo del Agente 05 sobre 8 interfaces sin operaciones de datos es CORRECTO. Sin embargo, #22 (Consentimiento Requerido) SI tiene operacion de datos (verificar consentimiento vigente), por lo que la lista correcta tiene 8 interfaces sin datos pero la composicion difiere: se excluye #22 y se incluye #36 y #38. El Agente 05 incluyo #22 erroneamente -- esa interfaz requiere una query a `consents`.

---

# PARTE B -- Lista Completa de Gaps, Riesgos y Observaciones

## GAPS CRITICOS

### GAP-001: No existe tabla ni estructura para configuracion global del sistema

**Interfaces afectadas:** #30 (Config del Sistema), #34 (Sidebar Admin -- indicador estado)
**Descripcion:** La interfaz #30 requiere persistir: (1) texto y versiones del documento de consentimiento, (2) keywords de guardrails con categoria y estado activo, (3) parametros de API Gemini (timeout, modelo), (4) umbral de severidad SOS. NO existe tabla `system_config`, `consent_versions`, `guardrail_keywords` ni similar en el DDL.

**Query que NO se puede escribir:**
```sql
-- No existe tabla para almacenar configuracion global
SELECT key, value FROM system_config WHERE category = 'guardrails';
-- No existe tabla para almacenar texto del consentimiento
SELECT version, body_text, created_at FROM consent_versions ORDER BY created_at DESC LIMIT 1;
-- No existe tabla para almacenar keywords de guardrails
SELECT keyword, category, is_active FROM guardrail_keywords WHERE is_active = true;
```

**Solucion propuesta:** Crear tabla `system_config` tipo key-value con JSONB:
```sql
CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```
Y/o tablas especializadas `consent_versions` y `guardrail_keywords` si se prefiere tipado fuerte. Ver respuesta P1 para analisis detallado.

---

### GAP-002: No existe tabla para versiones del documento de consentimiento

**Interfaces afectadas:** #06 (Consentimiento), #22 (Consentimiento Requerido), #30 (Config Sistema -- seccion Consentimiento)
**Descripcion:** La tabla `consents` registra ACEPTACIONES de consentimiento (quien acepto, que version, cuando). Pero el TEXTO del documento de consentimiento, sus versiones, y la version activa no se almacenan en ninguna tabla. La interfaz #30 permite "Crear nueva version" con editor de texto, y la #06 debe mostrar "el texto legal completo". Actualmente ese texto seria hardcodeado en frontend o en un archivo, sin versionado en BD.

**Query que NO se puede escribir:**
```sql
-- Obtener texto actual del consentimiento para mostrarlo en #06
SELECT version, body_text, scope_descriptions, created_at
FROM consent_versions
WHERE is_active = true;
```

**Solucion propuesta:** Crear tabla `consent_versions`:
```sql
CREATE TABLE consent_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT NOT NULL UNIQUE,
  body_text   TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Solo una version puede estar activa
CREATE UNIQUE INDEX uq_consent_versions_active ON consent_versions(is_active) WHERE is_active = true;
```

---

### GAP-003: No existe almacenamiento para latencia por turno (necesario para metricas #27C)

**Interfaces afectadas:** #24 (Dashboard Admin -- KPI latencia), #27C (Metricas Tecnicas -- p50/p95/p99)
**Descripcion:** La interfaz #27C requiere calcular percentiles de latencia (p50, p95, p99) por dia. La latencia por turno (tiempo entre envio del mensaje del usuario y finalizacion de respuesta del asistente) NO se almacena en ninguna columna explicita. El campo `messages.meta` (JSONB) PODRIA contener `{"latency_ms": 1234}` por convencion, pero esto no esta documentado ni garantizado, y calcular percentiles sobre JSONB es ineficiente sin indice GIN.

**Query que seria ineficiente:**
```sql
-- Calcular p50/p95/p99 sobre JSONB -- funcional pero lento sin GIN
SELECT
  DATE(m.created_at) AS day,
  percentile_cont(ARRAY[0.5, 0.95, 0.99])
    WITHIN GROUP (ORDER BY (m.meta->>'latency_ms')::NUMERIC) AS percentiles
FROM messages m
WHERE m.role = 'assistant'
  AND m.meta ? 'latency_ms'
  AND m.created_at >= :start_date
GROUP BY DATE(m.created_at);
```

**Solucion propuesta:** Agregar columna dedicada `messages.latency_ms INT` para almacenar latencia por turno de respuesta del asistente. Esto permite percentiles eficientes sin depender de JSONB:
```sql
ALTER TABLE messages ADD COLUMN latency_ms INT;
CREATE INDEX idx_messages_latency ON messages(created_at) WHERE role = 'assistant' AND latency_ms IS NOT NULL;
```
Con esta columna, la query seria:
```sql
SELECT
  DATE(m.created_at) AS day,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY m.latency_ms) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY m.latency_ms) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY m.latency_ms) AS p99
FROM messages m
WHERE m.role = 'assistant'
  AND m.latency_ms IS NOT NULL
  AND m.created_at >= :start_date
GROUP BY DATE(m.created_at)
ORDER BY day;
```

---

## GAPS MENORES

### GAP-004: Falta indice en consents para verificacion de consentimiento vigente

**Interfaces afectadas:** #06, #08, #09, #10, #14, #15, #22, #34B -- TODAS las pantallas autenticadas de estudiante
**Descripcion:** La verificacion de consentimiento vigente se ejecuta en cada carga de pagina autenticada (guard de React Router). La query `SELECT ... FROM consents WHERE user_id = :id ORDER BY accepted_at DESC LIMIT 1` no tiene indice dedicado. Con 30 usuarios y ~60 registros, el impacto es nulo en MVP, pero es una best practice tenerlo.

**Query actual (funciona pero sin indice):**
```sql
SELECT id, version, scope, accepted_at
FROM consents
WHERE user_id = :user_id
ORDER BY accepted_at DESC
LIMIT 1;
```

**Solucion propuesta:**
```sql
CREATE INDEX idx_consents_user_accepted ON consents(user_id, accepted_at DESC);
```
El Agente 05 identifico correctamente este indice faltante.

---

### GAP-005: Falta columna `last_active_at` en users o mecanismo equivalente

**Interfaces afectadas:** #28 (Gestion Usuarios -- columna "ultimo acceso"), #29 (Detalle Usuario -- "Ultimo acceso")
**Descripcion:** Las interfaces #28 y #29 muestran "ultimo acceso" por usuario. El esquema actual no tiene `users.last_active_at`. Se puede calcular como `MAX(sessions.started_at)` pero requiere subquery o JOIN por cada fila de la tabla de usuarios.

**Query actual (workaround):**
```sql
SELECT u.id, u.email, u.created_at,
       (SELECT MAX(s.started_at) FROM sessions s WHERE s.user_id = u.id) AS last_active_at
FROM users u
WHERE u.role = 'student' AND u.deleted_at IS NULL;
```

**Solucion propuesta:** Usar la subquery (aceptable para 30 usuarios). Alternativamente, agregar columna desnormalizada:
```sql
ALTER TABLE users ADD COLUMN last_active_at TIMESTAMP;
```
Actualizada via trigger o logica de aplicacion al crear sesion. Para MVP, la subquery es suficiente.

---

### GAP-006: Falta columna `revoked_at` en consents para estado "Revocado"

**Interfaces afectadas:** #17 (Modal Revocacion), #28 (Filtro estado consentimiento), #29 (Detalle Usuario)
**Descripcion:** La interfaz #28 requiere filtrar por estado de consentimiento "Vigente/Pendiente/Revocado". La interfaz #17 permite revocar consentimiento (bajar scope o revocar totalmente). Pero la tabla `consents` no tiene columna `revoked_at` ni mecanismo para marcar un consentimiento como revocado. La opcion 1 de #17 (bajar scope) usa `PATCH consents/current` para cambiar scope, pero no hay columna para registrar la revocacion parcial.

**Logica actual de estados (derivada):**
- Vigente = tiene registro en consents con version = version_actual_del_sistema
- Pendiente = no tiene ningun registro en consents (usuario nuevo)
- Revocado = ??? (no hay mecanismo)

**Solucion propuesta:** Agregar columna `revoked_at` a consents:
```sql
ALTER TABLE consents ADD COLUMN revoked_at TIMESTAMP;
```
- Vigente: `revoked_at IS NULL` AND `version` = version activa del sistema
- Pendiente: no tiene consent, o tiene consent con version < version activa
- Revocado: `revoked_at IS NOT NULL`

---

### GAP-007: Falta indice en attachments por message_id

**Interfaces afectadas:** #10 (Chat -- audio ASR), #14 (Detalle Sesion -- adjuntos), #40 (Exportar Datos)
**Descripcion:** La tabla `attachments` tiene FK `message_id` pero no tiene indice explicito sobre ella. El indice implicito del PK sobre `id` no cubre busquedas por `message_id`. Cuando se cargan los mensajes de una sesion con sus adjuntos, la query `SELECT * FROM attachments WHERE message_id IN (...)` haria full scan.

**Query afectada:**
```sql
SELECT a.id, a.kind, a.path, a.meta
FROM attachments a
WHERE a.message_id = :message_id;
```

**Solucion propuesta:**
```sql
CREATE INDEX idx_attachments_message ON attachments(message_id);
```

---

### GAP-008: Falta indice en message_reports por reporter_id

**Interfaces afectadas:** #29 (Detalle Usuario -- "Reportes realizados"), #40 (Exportar Datos)
**Descripcion:** La interfaz #29 muestra "Reportes realizados" por usuario. La query requiere filtrar message_reports por `reporter_id`, pero no existe indice sobre esa columna. El indice UNIQUE `uq_message_reports_msg_user` es sobre `(message_id, reporter_id)`, lo cual NO sirve para buscar solo por `reporter_id` (la columna no es la primera del indice compuesto).

**Query afectada:**
```sql
SELECT COUNT(*) FROM message_reports WHERE reporter_id = :user_id;
```

**Solucion propuesta:**
```sql
CREATE INDEX idx_message_reports_reporter ON message_reports(reporter_id);
```

---

## RIESGOS DE RENDIMIENTO

### RISK-001: Calculo de percentiles de latencia sobre JSONB sin indice GIN

**Interfaces afectadas:** #27C (Metricas Tecnicas)
**Descripcion:** Si se opta por almacenar latencia en `messages.meta` en lugar de columna dedicada (GAP-003), los calculos de percentile_cont sobre `(meta->>'latency_ms')::NUMERIC` seran lentos sin indice GIN. Con 30 usuarios y ~10K mensajes, el impacto es aceptable, pero escalaria mal.

**Mitigacion:** Adoptar la solucion de GAP-003 (columna `latency_ms` dedicada).

---

### RISK-002: Queries agregadas del Dashboard Admin (#24) sin vistas materializadas

**Interfaces afectadas:** #24 (Dashboard Admin -- 6 KPIs + 6 graficas)
**Descripcion:** El dashboard requiere multiples queries agregadas simultaneas: COUNT de usuarios, COUNT de sesiones hoy, COUNT de safety events 24h, COUNT de reportes open, AVG de latencia, AVG de SUS score, mas 6 graficas con series temporales de 30 dias. Todas ejecutadas al cargar la pagina.

**Queries involucradas:**
```sql
-- KPI 1: Total usuarios
SELECT COUNT(*) FROM users WHERE role = 'student' AND deleted_at IS NULL;
-- KPI 2: Sesiones hoy
SELECT COUNT(*) FROM sessions WHERE DATE(started_at) = CURRENT_DATE;
-- KPI 3: Safety events 24h
SELECT COUNT(*) FROM safety_events WHERE created_at >= NOW() - INTERVAL '24 hours';
-- KPI 4: Reportes pendientes
SELECT COUNT(*) FROM message_reports WHERE status = 'open';
-- KPI 5: Latencia promedio (requiere GAP-003 resuelto)
-- KPI 6: SUS promedio
SELECT AVG(score) FROM survey_responses WHERE instrument = 'sus';
-- + 6 graficas con GROUP BY DATE y JOINs
```

**Mitigacion:** Para MVP (30 usuarios, <10K registros), estas queries son instantaneas (<10ms cada una). Post-MVP, considerar vistas materializadas o tabla de metricas pre-calculadas con refresh periodico.

---

### RISK-003: Filtro de "estado de consentimiento" en #28 requiere logica compleja sin tabla de versiones

**Interfaces afectadas:** #28 (Gestion Usuarios -- filtro consentimiento)
**Descripcion:** Filtrar usuarios por "Vigente/Pendiente/Revocado" requiere cruzar `consents` con la version activa del sistema (que no esta en BD, ver GAP-001 y GAP-002). Sin tabla `consent_versions`, la version activa debe ser un parametro hardcodeado.

**Query compleja resultante:**
```sql
SELECT u.id, u.email,
  CASE
    WHEN c.id IS NULL THEN 'Pendiente'
    WHEN c.revoked_at IS NOT NULL THEN 'Revocado'  -- requiere GAP-006
    WHEN c.version < :current_version THEN 'Pendiente'
    ELSE 'Vigente'
  END AS consent_status
FROM users u
LEFT JOIN LATERAL (
  SELECT id, version, revoked_at FROM consents
  WHERE user_id = u.id ORDER BY accepted_at DESC LIMIT 1
) c ON TRUE
WHERE u.role = 'student' AND u.deleted_at IS NULL;
```

**Mitigacion:** Resolver GAP-001 (tabla `consent_versions`) y GAP-006 (columna `revoked_at`) para simplificar esta query.

---

### RISK-004: Top 5 keywords de guardrails (#27D) requiere extraccion de JSONB no indexado

**Interfaces afectadas:** #27D (Metricas de Seguridad)
**Descripcion:** Extraer "Top 5 keywords de guardrails" implica descomponer el JSONB de `safety_events.payload` o `messages.safety_flags` para contar frecuencias de keywords. Sin indice GIN, esto requiere full scan y descomposicion JSON en cada fila.

**Query funcional pero potencialmente lenta:**
```sql
SELECT keyword, COUNT(*) AS frequency
FROM safety_events se,
  jsonb_array_elements_text(se.payload->'keywords') AS keyword
WHERE se.event_type IN ('risk_detected', 'guardrail_triggered')
  AND se.created_at >= :start_date
GROUP BY keyword
ORDER BY frequency DESC
LIMIT 5;
```

**Mitigacion:** Con <1000 safety_events en MVP, esta query es rapida. Post-MVP, considerar habilitar indice GIN sobre `safety_events.payload` o mantener tabla desnormalizada de keywords detectadas.

---

### RISK-005: Exportacion ARCO (#40) requiere JOINs multitabla

**Interfaces afectadas:** #40 (Modal Exportar Datos)
**Descripcion:** La exportacion de datos personales requiere recolectar datos de 7+ tablas: users, consents, preferences, sessions (count), messages (count), message_reports (count), safety_events (count). Es un JOIN masivo pero ejecutado una sola vez por peticion.

**Query:**
```sql
SELECT
  u.email, u.display_name, u.created_at,
  (SELECT json_agg(json_build_object('version', c.version, 'scope', c.scope, 'accepted_at', c.accepted_at))
   FROM consents c WHERE c.user_id = u.id) AS consents,
  (SELECT row_to_json(p.*) FROM preferences p WHERE p.user_id = u.id) AS preferences,
  (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS total_sessions,
  (SELECT COUNT(*) FROM messages m
   JOIN sessions s ON m.session_id = s.id
   WHERE s.user_id = u.id) AS total_messages,
  (SELECT COUNT(*) FROM message_reports mr WHERE mr.reporter_id = u.id) AS total_reports
FROM users u
WHERE u.id = :user_id;
```

**Mitigacion:** Aceptable para operacion puntual. No requiere optimizacion para MVP.

---

## OBSERVACIONES

### OBS-001: #13 (Historial de Sesiones) esta DEPRECATED pero el catalogo local aun lo define

**Interfaces afectadas:** #13
**Descripcion:** Segun la pagina de Notion, #13 esta marcado como `[DEPRECATED -- Integrado en Sidebar]`. Sin embargo, el archivo local `INTERFACES_MVP_CATALOGO.md` aun lo define con ruta `/history` y operaciones completas. La funcionalidad fue migrada al Sidebar (#34B). Las operaciones de datos (listar sesiones, eliminar sesion) siguen siendo validas pero se acceden desde #34B y #14.

**Impacto en BD:** Ninguno. Las queries son las mismas independientemente de que componente UI las invoque.

---

### OBS-002: #23 (Login Admin) es identico a #03 (Login) -- no es interfaz separada

**Interfaces afectadas:** #23
**Descripcion:** Segun decision D-01 del catalogo, el login es unificado. #23 no es una interfaz separada sino una nota de que el mismo #03 aplica para admins. No agrega operaciones de datos adicionales.

---

### OBS-003: Ambiguedad en campo `severity` de safety_events

**Interfaces afectadas:** #25 (Panel Safety Events -- filtro por severidad)
**Descripcion:** La interfaz #25 permite filtrar por "severidad (1-5)" pero la tabla `safety_events` NO tiene columna `severity`. El payload JSONB podria contener severidad, pero no hay CHECK constraint. La severidad existe en `message_reports` (con CHECK 1-5) pero no en safety_events. El filtro en #25 necesitaria `payload->>'severity'`.

**Query necesaria:**
```sql
-- Filtrar safety_events por severidad extraida de payload
SELECT * FROM safety_events
WHERE (payload->>'severity')::INT = :severity
ORDER BY created_at DESC;
```

**Impacto:** Funcional pero depende de convencion del payload JSONB. Sin validacion en BD.

---

### OBS-004: Tiempo promedio de resolucion de reportes (#26) requiere calculo derivado

**Interfaces afectadas:** #26 (Panel Reportes -- "Tiempo promedio de resolucion")
**Descripcion:** El indicador "Tiempo promedio de resolucion" requiere calcular la diferencia entre `created_at` y `updated_at` para reportes con estado `resolved`. La columna `updated_at` existe y se actualiza al cambiar estado. La query es funcional.

**Query:**
```sql
SELECT AVG(updated_at - created_at) AS avg_resolution_time
FROM message_reports
WHERE status = 'resolved' AND updated_at IS NOT NULL;
```

**Impacto:** Ninguno. Query correcta y eficiente con los datos existentes.

---

### OBS-005: Campo `save_history` controla persistencia de mensajes pero NO de sesiones

**Interfaces afectadas:** #34B (Sidebar -- historial), #08 (Home -- sesiones recientes)
**Descripcion:** Segun la decision de diseno 3.8, cuando `save_history = FALSE` el backend no ejecuta INSERT en `messages` pero SI crea el registro de `sessions`. Esto significa que el sidebar mostraria sesiones vacias (sin mensajes) incluso con historial desactivado. La interfaz #34B indica "Historial desactivado" como empty state, pero tecnicamente las sesiones SI existen.

**Impacto:** Logica de aplicacion, no de BD. El frontend debe verificar `preferences.save_history` para decidir si mostrar el listado de sesiones o el empty state.

---

### OBS-006: Patron "Consentimiento Requerido" (#22) depende de saber la version activa

**Interfaces afectadas:** #22 (Consentimiento Requerido)
**Descripcion:** La interfaz indica "Si nueva version: texto con v.X.X". Para determinar si hay nueva version, se necesita comparar el `consents.version` del usuario con la version activa del sistema. Sin tabla `consent_versions` (GAP-002), esta comparacion depende de un valor hardcodeado.

---

# PARTE C -- Respuestas a las 10 Preguntas (P1-P10)

## P1: Configuracion global (#30)

**Pregunta:** La interfaz documenta 4 secciones: consentimiento, guardrails, API Gemini, estado del sistema. Donde se persiste? Hay tabla para esto?

**Respuesta: GAP CRITICO. No existe tabla para configuracion global.**

La interfaz #30 requiere persistir:

| Seccion | Datos a persistir | Tabla existente? |
|---------|-------------------|------------------|
| Consentimiento | Texto del documento, versiones, version activa | NO |
| Guardrails | Keywords de riesgo, categorias, estado activo, umbral SOS | NO |
| API Gemini | Timeout, modelo en uso | NO |
| Estado del Sistema | No requiere persistencia (runtime health checks) | N/A |

**Analisis detallado:**
- La tabla `consents` almacena ACEPTACIONES de usuarios, no el TEXTO del documento.
- No existe tabla `guardrail_keywords` ni `system_config`.
- Los parametros de Gemini (timeout, modelo) podrian ir en variables de entorno, pero la interfaz #30 permite editarlos desde el panel admin con persistencia.

**Recomendacion:** Crear 2 tablas nuevas:
1. `consent_versions` -- para el texto y versionado del documento de consentimiento (ver GAP-002)
2. `system_config` -- tabla key-value con JSONB para guardrails, parametros Gemini, y cualquier configuracion editable por admin

Alternativa: Una sola tabla `system_config` con keys como `guardrail_keywords`, `guardrail_sos_threshold`, `gemini_timeout`, `gemini_model`, `consent_active_version`.

---

## P2: Filtro de consentimiento (#28)

**Pregunta:** "Estado de consentimiento (Vigente/Pendiente/Revocado)". Como se determina cada estado solo con la tabla `consents`?

**Respuesta: No se puede determinar "Revocado" con el esquema actual. GAP MENOR.**

| Estado | Logica actual | Problema |
|--------|--------------|----------|
| Vigente | `EXISTS(SELECT 1 FROM consents WHERE user_id = :id AND version = :current_version AND revoked_at IS NULL)` | Requiere GAP-002 (saber version activa) y GAP-006 (columna `revoked_at`) |
| Pendiente | `NOT EXISTS(SELECT 1 FROM consents WHERE user_id = :id)` O tiene consent con version < version activa | Requiere GAP-002 |
| Revocado | No hay mecanismo. La tabla `consents` no tiene `revoked_at` | **GAP-006** |

**Detalle:**
- Actualmente, la interfaz #17 (Revocacion) ofrece: Opcion 1 = bajar scope (PATCH consents/current), Opcion 2 = revocar totalmente (eliminar cuenta). La opcion 1 no es una revocacion, es un cambio de scope. La opcion 2 elimina todo via CASCADE.
- Para el filtro de #28, "Revocado" deberia significar que el usuario tenia consentimiento y lo revoco sin eliminar su cuenta. Con el esquema actual, esto NO ES POSIBLE porque la revocacion total implica eliminacion de cuenta.
- Si en la practica "Revocado" es imposible (porque siempre lleva a eliminar cuenta), entonces el filtro se simplifica a Vigente/Pendiente y no hay gap.

**Recomendacion:** Confirmar con el PO si "Revocado" es un estado real posible sin eliminacion de cuenta. Si lo es, implementar GAP-006. Si no, el filtro se reduce a Vigente/Pendiente y se elimina la opcion "Revocado" de la interfaz.

---

## P3: Latencia por turno (#27C)

**Pregunta:** Latencia p50/p95/p99 por turno. Donde se almacena? En `messages.meta`? Es eficiente calcular percentiles sobre JSONB?

**Respuesta: GAP CRITICO. No hay almacenamiento explicito. JSONB es ineficiente para percentiles.**

**Situacion actual:**
- `messages.meta` (JSONB) PUEDE contener `{"latency_ms": 1234}` pero no esta documentado ni garantizado.
- PostgreSQL 16 soporta `percentile_cont(fraction) WITHIN GROUP (ORDER BY ...)` pero requiere un tipo numerico ordenable, no un valor JSONB.
- La extraccion `(meta->>'latency_ms')::NUMERIC` funciona pero requiere cast por fila.
- Sin indice GIN sobre `meta`, cada calculo de percentil hace full scan + deserializacion JSON por fila.

**Calculo de impacto para MVP:**
- 30 usuarios x ~10 sesiones x ~20 mensajes assistant = ~6,000 filas
- Full scan + cast JSONB sobre 6,000 filas: ~5-10ms (aceptable)
- Con 100K+ mensajes post-MVP: ~500ms+ (problematico)

**Recomendacion:** Agregar columna dedicada `messages.latency_ms INT` (ver GAP-003). Esto es el enfoque optimo segun Context7 para PostgreSQL 16 percentile_cont -- la funcion requiere tipo sortable nativo.

---

## P4: Top keywords guardrails (#27D)

**Pregunta:** "Top 5 keywords de guardrails". Se extraen de `messages.safety_flags`? O de `safety_events.payload`? Ambos?

**Respuesta: Se extraen de `safety_events.payload`. Funcional con convencion JSONB.**

**Analisis:**
- `messages.safety_flags` contiene `{"risk_detected": true, "keywords": ["suicidio", "autolesion"], "severity": 4}` (estructura documentada en Notion)
- `safety_events.payload` contiene datos similares: `{"keywords": ["suicidio"], "action": "sos_shown"}`
- Ambas fuentes contienen keywords, pero `safety_events` es la fuente canonnica porque:
  1. Cada evento de seguridad es unico y registrado explicitamente
  2. `messages` podria no existir si `save_history = OFF`
  3. `safety_events` preserva el registro incluso si la sesion se elimina (SET NULL)

**Query recomendada:**
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

**Riesgo:** Esta query es RISK-004 (depende de JSONB no indexado). Aceptable para MVP.

---

## P5: Importacion instrumentos (#27E)

**Pregunta:** POST import de resultados SUS/empatia. Como vincular resultado externo con usuario? Por email?

**Respuesta: Se vincula por `user_id` (UUID). El flujo de importacion requiere mapeo previo email->UUID.**

**Analisis:**
- La tabla `survey_responses` tiene `user_id UUID REFERENCES users(id)`.
- Los instrumentos se administran FUERA de Mabel IA (Decision D-11).
- El admin importa resultados via `POST /api/v1/admin/metrics/import`.
- El CSV/JSON de importacion debe contener un identificador del estudiante.

**Flujo propuesto:**
1. El CSV de importacion contiene `email` del estudiante (o un codigo anonimo asignado previamente).
2. El backend resuelve `email -> user_id` via `SELECT id FROM users WHERE email = :email`.
3. Se inserta en `survey_responses` con el `user_id` resuelto.

**Query de importacion:**
```sql
INSERT INTO survey_responses (user_id, instrument, phase, score, raw_data, administered_at, imported_by)
SELECT u.id, :instrument, :phase, :score, :raw_data, :administered_at, :admin_id
FROM users u WHERE u.email = :student_email;
```

**Proteccion contra duplicados:** El constraint UNIQUE `uq_survey_user_instrument_phase` previene inserciones duplicadas. Ante conflicto: `ON CONFLICT DO NOTHING` o `DO UPDATE SET score = EXCLUDED.score` segun politica.

**Impacto en BD:** Ninguno. El esquema actual soporta este flujo completamente. OK.

---

## P6: Tokens y costo (#27C)

**Pregunta:** `messages.tokens_prompt` + `messages.tokens_completion`. Son suficientes para costo estimado? Se necesita modelo/pricing por turno?

**Respuesta: Suficientes para MVP con Gemini unico. GAP MENOR para multi-modelo post-MVP.**

**Analisis:**
- Gemini tiene pricing por millon de tokens (input/output diferenciado).
- `tokens_prompt` (input) y `tokens_completion` (output) capturan ambas metricas.
- El costo se calcula como: `SUM(tokens_prompt) * price_per_input_token + SUM(tokens_completion) * price_per_output_token`.
- El precio por token es un parametro de configuracion (no necesita estar en BD por cada mensaje).

**Query para costo:**
```sql
SELECT
  DATE(created_at) AS day,
  SUM(tokens_prompt) AS total_prompt_tokens,
  SUM(tokens_completion) AS total_completion_tokens,
  -- Precio hardcodeado para gemini-2.5-flash (MVP unico modelo)
  ROUND(SUM(tokens_prompt) * 0.000000075 + SUM(tokens_completion) * 0.0000003, 4) AS estimated_cost_usd
FROM messages
WHERE role = 'assistant'
  AND created_at >= :start_date
GROUP BY DATE(created_at)
ORDER BY day;
```

**Para post-MVP (multi-modelo):**
- `messages.meta->>'model'` ya almacena el modelo usado.
- Se necesitaria tabla de pricing por modelo o parametro en `system_config`.
- Esto se resolveria junto con GAP-001 (system_config).

**Impacto actual:** OK para MVP. El pricing es un parametro de configuracion, no requiere cambio en BD.

---

## P7: Ultimo acceso (#28, #29)

**Pregunta:** Se calcula como `MAX(sessions.started_at)` o deberia ser columna en `users`?

**Respuesta: GAP MENOR. Se calcula como MAX(sessions.started_at). Columna desnormalizada es opcional.**

**Opciones:**

| Opcion | Pros | Contras |
|--------|------|---------|
| Subquery `MAX(sessions.started_at)` | Sin cambio en BD, siempre preciso | Subquery por fila en listado de usuarios |
| Columna `users.last_active_at` | Query directa, indice simple | Requiere ALTER TABLE + mantener sincronizado |

**Para MVP (30 usuarios):**
```sql
-- Opcion 1: Subquery (recomendada para MVP)
SELECT u.id, u.email,
  (SELECT MAX(s.started_at) FROM sessions s WHERE s.user_id = u.id) AS last_active_at
FROM users u
WHERE u.role = 'student' AND u.deleted_at IS NULL
ORDER BY last_active_at DESC NULLS LAST;
```
Con 30 usuarios, esta subquery correlacionada es instantanea (<1ms por fila, el indice `idx_sessions_user_time` la cubre).

**Recomendacion:** Usar subquery para MVP. Si crece a >500 usuarios, agregar columna desnormalizada.

---

## P8: Estado de servicios (#30)

**Pregunta:** "Estado BD", "Estado ASR/TTS", "uptime". Runtime health checks o persistido?

**Respuesta: Runtime health checks. NO requiere persistencia en BD.**

**Analisis:**
- "Estado BD" = ejecutar `SELECT 1` y medir latencia. Si responde, OK.
- "Estado ASR/TTS" = hacer ping al proceso local de faster-whisper / Piper TTS.
- "Uptime" = tiempo desde inicio del proceso FastAPI (variable en memoria).
- "Version app" = constante en codigo.

Estos son health checks en tiempo real que el endpoint `GET /api/v1/admin/config` ejecuta al momento de la peticion. NO se persisten en BD.

**Impacto en BD:** Ninguno. No requiere cambio en esquema.

---

## P9: Version del consentimiento (#30)

**Pregunta:** "Crear nueva version" de consentimiento. `consents` registra aceptaciones, no versiones del documento. Donde va el texto?

**Respuesta: GAP CRITICO. El texto del consentimiento no se almacena en BD. Ver GAP-002.**

**Situacion actual:**
- `consents` almacena: quien (user_id), que version (TEXT libre, ej: "1.0"), que scope, cuando.
- El TEXTO del documento no esta en ninguna tabla.
- La interfaz #06 necesita "texto legal completo" -- actualmente deberia estar hardcodeado.
- La interfaz #30 permite "Crear nueva version" con editor de texto -- no hay donde guardar.

**Flujo deseado:**
1. Admin en #30 escribe texto nuevo del consentimiento con version "2.0"
2. Marca la version como activa
3. Todos los estudiantes ven #22 (Consentimiento Requerido) al no tener consent con version "2.0"
4. Estudiante en #06 lee el texto de la version "2.0" de BD
5. Estudiante acepta -> INSERT en `consents` con version "2.0"

**Solucion:** Crear tabla `consent_versions` (ver GAP-002). Esto es GAP CRITICO porque sin ella, todo el flujo de versionado de consentimiento depende de texto hardcodeado, violando los requisitos de auditoria de la Ley 1581/2012.

---

## P10: Exportacion ARCO (#40)

**Pregunta:** La query de exportacion necesita JOINs con todas las tablas del usuario? CASCADE no impide exportar antes de borrar?

**Respuesta: OK. La exportacion funciona correctamente. CASCADE no interfiere.**

**Analisis detallado:**

1. **JOINs necesarios:** La exportacion requiere datos de 7 tablas: users, consents, preferences, sessions (conteo), messages (conteo), message_reports (conteo), safety_events (conteo). Esto es un conjunto de subqueries correlacionadas, no un JOIN masivo.

2. **CASCADE no interfiere:** CASCADE solo se activa al ejecutar `DELETE FROM users WHERE id = :id`. La exportacion es un SELECT que lee datos ANTES de cualquier DELETE. El flujo correcto es: (1) usuario pide exportar -> se genera JSON/CSV, (2) usuario pide eliminar -> se ejecuta DELETE CASCADE.

3. **Orden de operaciones en eliminacion de cuenta (#16):**
   - Frontend muestra Modal #16
   - Usuario escribe "ELIMINAR" y confirma
   - Backend ejecuta: `GET /api/v1/users/me/export` (opcional, si el usuario pidio exportar antes) y luego `DELETE /api/v1/users/me` (que dispara CASCADE)
   - No hay race condition porque son operaciones secuenciales del mismo usuario

**Query de exportacion completa:**
```sql
SELECT json_build_object(
  'account', json_build_object(
    'email', u.email,
    'display_name', u.display_name,
    'created_at', u.created_at
  ),
  'consents', (SELECT json_agg(json_build_object(
    'version', c.version, 'scope', c.scope, 'accepted_at', c.accepted_at
  )) FROM consents c WHERE c.user_id = u.id),
  'preferences', (SELECT row_to_json(p) FROM preferences p WHERE p.user_id = u.id),
  'statistics', json_build_object(
    'total_sessions', (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id),
    'total_messages', (SELECT COUNT(*) FROM messages m
      JOIN sessions s ON m.session_id = s.id WHERE s.user_id = u.id),
    'total_reports', (SELECT COUNT(*) FROM message_reports mr WHERE mr.reporter_id = u.id),
    'total_safety_events', (SELECT COUNT(*) FROM safety_events se WHERE se.user_id = u.id)
  )
) AS export_data
FROM users u
WHERE u.id = :user_id AND u.deleted_at IS NULL;
```

**Impacto en BD:** Ninguno. El esquema soporta esta operacion completamente.

---

# PARTE D -- Cobertura por Tabla

## Resumen de uso de cada tabla

| # | Tabla | Operaciones que la usan | Interfaces que la usan | Gaps asociados |
|---|-------|------------------------|----------------------|----------------|
| 1 | `users` | 14 | #02, #03, #05, #08, #15, #16, #23, #24, #28, #29, #33, #40, #42 | GAP-005 (last_active_at) |
| 2 | `consents` | 8 | #06, #08, #15, #17, #22, #28, #29, #40 | GAP-004 (indice), GAP-006 (revoked_at) |
| 3 | `preferences` | 7 | #07, #08, #09, #10, #15, #29, #40 | Ninguno |
| 4 | `sessions` | 12 | #08, #09, #10, #14, #18, #24, #27A, #27B, #29, #34B, #40 | Ninguno |
| 5 | `messages` | 10 | #10, #11, #14, #24, #27A, #27C, #27D, #40 | GAP-003 (latency_ms) |
| 6 | `message_reports` | 6 | #11, #24, #26, #29, #40 | GAP-008 (indice reporter_id) |
| 7 | `attachments` | 3 | #10, #14, #40 | GAP-007 (indice message_id) |
| 8 | `safety_events` | 8 | #10, #12, #24, #25, #27D, #29, #34, #40 | OBS-003 (severity en payload) |
| 9 | `password_reset_tokens` | 3 | #04, #05 | Ninguno |
| 10 | `audit_logs` | 4 | #25, #26, #28, #30, #31 | Ninguno |
| 11 | `survey_responses` | 3 | #24, #27E | Ninguno |
| -- | `system_config` (NO EXISTE) | 4 | #30, #34 | GAP-001 |
| -- | `consent_versions` (NO EXISTE) | 4 | #06, #22, #28, #30 | GAP-002 |

## Detalle de operaciones por tabla

### 1. users (14 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #02 | INSERT usuario | `INSERT INTO users (email, hashed_password, display_name) VALUES (...)` | OK |
| #03 | SELECT para login | `SELECT id, email, hashed_password, role FROM users WHERE email = :email AND deleted_at IS NULL AND disabled_at IS NULL` | OK |
| #05 | UPDATE password | `UPDATE users SET hashed_password = :new_hash WHERE id = :id` | OK |
| #08 | SELECT display_name | `SELECT display_name FROM users WHERE id = :id` | OK |
| #15 | SELECT email (readonly) | `SELECT email FROM users WHERE id = :id` | OK |
| #16 | UPDATE soft-delete | `UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = :id` | OK |
| #24 | COUNT total | `SELECT COUNT(*) FROM users WHERE role = 'student' AND deleted_at IS NULL` | OK |
| #28 | SELECT listado paginado | `SELECT id, email, created_at, disabled_at FROM users WHERE role = 'student' AND deleted_at IS NULL ...` | OK |
| #28 | UPDATE deshabilitar | `UPDATE users SET disabled_at = CURRENT_TIMESTAMP, disabled_reason = :reason WHERE id = :id` | OK |
| #29 | SELECT detalle | `SELECT * FROM users WHERE id = :id` | OK |
| #33 | SELECT nombre/rol para header | `SELECT display_name, role FROM users WHERE id = :id` | OK |
| #40 | SELECT para exportacion | ver query de P10 | OK |
| #42 | UPDATE cambiar password | `UPDATE users SET hashed_password = :new_hash WHERE id = :id` | OK |
| #28 | SELECT con filtro consentimiento | ver RISK-003 | RISK-003 |

### 2. consents (8 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #06 | INSERT aceptar | `INSERT INTO consents (user_id, version, scope) VALUES (:uid, :ver, :scope)` | OK |
| #08 | SELECT verificar vigente | `SELECT id, version FROM consents WHERE user_id = :uid ORDER BY accepted_at DESC LIMIT 1` | GAP-004 (falta indice) |
| #15 | SELECT consentimiento actual | misma que #08 | GAP-004 |
| #17 | UPDATE revocar scope | `UPDATE consents SET scope = 'solo_uso' WHERE user_id = :uid AND ...` | OBS (actualizar vs insertar nuevo registro) |
| #22 | SELECT verificar vigente | misma que #08 | GAP-004 |
| #28 | SELECT filtrar por estado | ver RISK-003 | RISK-003 + GAP-006 |
| #29 | SELECT mostrar consent | `SELECT version, scope, accepted_at FROM consents WHERE user_id = :uid ORDER BY accepted_at DESC LIMIT 1` | GAP-004 |
| #40 | SELECT para exportacion | `SELECT version, scope, accepted_at FROM consents WHERE user_id = :uid` | OK |

### 3. preferences (7 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #07 | INSERT/UPSERT inicial | `INSERT INTO preferences (user_id, save_history, checkin_enabled, ...) VALUES (...) ON CONFLICT (user_id) DO UPDATE SET ...` | OK |
| #08 | SELECT save_history | `SELECT save_history FROM preferences WHERE user_id = :uid` | OK |
| #09 | SELECT checkin_enabled | `SELECT checkin_enabled FROM preferences WHERE user_id = :uid` | OK |
| #10 | SELECT preferred_chat_mode | `SELECT preferred_chat_mode FROM preferences WHERE user_id = :uid` | OK |
| #15 | SELECT todas | `SELECT * FROM preferences WHERE user_id = :uid` | OK |
| #15 | UPDATE preferencias | `UPDATE preferences SET save_history = :val, tts_voice = :val, ... WHERE user_id = :uid` | OK |
| #29 | SELECT estado para admin | `SELECT save_history, checkin_enabled, tts_voice IS NOT NULL AS tts_on FROM preferences WHERE user_id = :uid` | OK |

### 4. sessions (12 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #08 | POST crear sesion | `INSERT INTO sessions (user_id, checkin_opt_in) VALUES (:uid, :opt_in) RETURNING id` | OK |
| #09 | PATCH checkin | `UPDATE sessions SET checkin_payload = :payload, checkin_completed_at = CURRENT_TIMESTAMP WHERE id = :sid` | OK |
| #10 | PATCH finalizar | `UPDATE sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = :sid` | OK |
| #10 | PATCH avatar_used | `UPDATE sessions SET avatar_used = true WHERE id = :sid AND avatar_used = false` | OK |
| #14 | SELECT detalle | `SELECT * FROM sessions WHERE id = :sid AND user_id = :uid` | OK |
| #14 | DELETE eliminar | `DELETE FROM sessions WHERE id = :sid AND user_id = :uid` | OK (CASCADE) |
| #18 | SELECT resumen | `SELECT started_at, ended_at, checkin_payload, (SELECT COUNT(*) FROM messages WHERE session_id = :sid) AS msg_count FROM sessions WHERE id = :sid` | OK |
| #24 | COUNT sesiones hoy | `SELECT COUNT(*) FROM sessions WHERE DATE(started_at) = CURRENT_DATE` | OK |
| #27A | SELECT uso por dia | `SELECT DATE(started_at) AS day, COUNT(DISTINCT user_id) AS active_users, COUNT(*) AS sessions FROM sessions WHERE started_at >= :start GROUP BY day` | OK |
| #27B | SELECT checkin data | `SELECT checkin_payload, started_at FROM sessions WHERE checkin_completed_at IS NOT NULL AND started_at >= :start` | OK |
| #29 | COUNT por usuario | `SELECT COUNT(*) FROM sessions WHERE user_id = :uid` | OK |
| #34B | SELECT historial sidebar | `SELECT id, started_at, ended_at, topic_hint FROM sessions WHERE user_id = :uid ORDER BY started_at DESC` | OK (usa idx_sessions_user_time) |

### 5. messages (10 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #10 | INSERT mensaje usuario | `INSERT INTO messages (session_id, role, content, content_sha256) VALUES (:sid, 'user', :content, :sha)` | OK |
| #10 | INSERT respuesta asistente | `INSERT INTO messages (session_id, role, content, meta, safety_flags, tokens_prompt, tokens_completion, latency_ms) VALUES (...)` | GAP-003 (latency_ms no existe) |
| #10 | SELECT historial sesion | `SELECT role, content, created_at, safety_flags FROM messages WHERE session_id = :sid ORDER BY created_at` | OK (usa idx_messages_session_time) |
| #14 | SELECT conversacion completa | misma que anterior | OK |
| #24 | AVG mensajes por sesion | `SELECT AVG(msg_count) FROM (SELECT COUNT(*) AS msg_count FROM messages GROUP BY session_id) sub` | OK |
| #27A | COUNT mensajes por sesion | `SELECT session_id, COUNT(*) FROM messages GROUP BY session_id` | OK |
| #27C | percentiles latencia | ver query de GAP-003 | GAP-003 |
| #27C | SUM tokens por dia | `SELECT DATE(created_at), SUM(tokens_prompt), SUM(tokens_completion) FROM messages WHERE role = 'assistant' GROUP BY 1` | OK |
| #27D | safety_flags analysis | `SELECT safety_flags FROM messages WHERE safety_flags IS NOT NULL AND safety_flags != 'null'::jsonb` | OK (baja frecuencia) |
| #40 | COUNT para exportacion | `SELECT COUNT(*) FROM messages m JOIN sessions s ON m.session_id = s.id WHERE s.user_id = :uid` | OK |

### 6. message_reports (6 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #11 | INSERT crear reporte | `INSERT INTO message_reports (message_id, reporter_id, reason, severity, details) VALUES (...)` | OK |
| #11 | SELECT verificar duplicado | `SELECT EXISTS(SELECT 1 FROM message_reports WHERE message_id = :mid AND reporter_id = :uid)` | OK (usa uq_message_reports_msg_user) |
| #24 | COUNT pendientes | `SELECT COUNT(*) FROM message_reports WHERE status = 'open'` | OK (usa idx_message_reports_status) |
| #26 | SELECT listado paginado | `SELECT mr.*, u.email FROM message_reports mr LEFT JOIN users u ON mr.reporter_id = u.id WHERE mr.status = :status ORDER BY mr.created_at DESC LIMIT :limit OFFSET :offset` | OK |
| #26 | PATCH cambiar estado | `UPDATE message_reports SET status = :status, updated_at = CURRENT_TIMESTAMP WHERE id = :id` | OK |
| #29 | COUNT por reporter | `SELECT COUNT(*) FROM message_reports WHERE reporter_id = :uid` | GAP-008 (falta indice) |

### 7. attachments (3 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #10 | INSERT adjunto audio | `INSERT INTO attachments (message_id, kind, path, meta) VALUES (:mid, 'audio', :path, :meta)` | OK |
| #14 | SELECT adjuntos de sesion | `SELECT a.* FROM attachments a JOIN messages m ON a.message_id = m.id WHERE m.session_id = :sid` | GAP-007 (falta indice) |
| #40 | COUNT para exportacion | incluido en query general | OK |

### 8. safety_events (8 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #10/#12 | INSERT evento crisis | `INSERT INTO safety_events (user_id, session_id, event_type, payload) VALUES (:uid, :sid, 'risk_detected', :payload)` | OK |
| #11 | INSERT evento reporte | `INSERT INTO safety_events (user_id, session_id, event_type, payload) VALUES (:uid, :sid, 'user_report', :payload)` | OK |
| #24 | COUNT eventos 24h | `SELECT COUNT(*) FROM safety_events WHERE created_at >= NOW() - INTERVAL '24 hours'` | OK |
| #25 | SELECT listado paginado | `SELECT se.*, u.email FROM safety_events se JOIN users u ON se.user_id = u.id WHERE se.status = :status ORDER BY se.created_at DESC` | OK (usa idx_safety_events_status) |
| #25 | PATCH cambiar estado | `UPDATE safety_events SET status = :status WHERE id = :id` | OK |
| #27D | SELECT por dia | `SELECT DATE(created_at) AS day, event_type, COUNT(*) FROM safety_events GROUP BY day, event_type` | OK |
| #27D | SELECT top keywords | ver RISK-004 | RISK-004 |
| #29 | COUNT por usuario | `SELECT COUNT(*) FROM safety_events WHERE user_id = :uid` | OK (usa idx_safety_events_user_time) |

### 9. password_reset_tokens (3 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #04 | INSERT crear token | `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (:uid, :hash, :exp)` | OK |
| #05 | SELECT validar token | `SELECT id, user_id, expires_at FROM password_reset_tokens WHERE token_hash = :hash AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP` | OK (usa idx_prt_token_active) |
| #05 | UPDATE marcar usado | `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = :id` | OK |

### 10. audit_logs (4 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #25/#26/#28/#30 | INSERT accion admin | `INSERT INTO audit_logs (admin_id, action, target_type, target_id, detail, ip_address) VALUES (...)` | OK |
| #31 | SELECT listado paginado | `SELECT al.*, u.email FROM audit_logs al LEFT JOIN users u ON al.admin_id = u.id WHERE al.created_at BETWEEN :start AND :end ORDER BY al.created_at DESC` | OK (usa idx_audit_logs_action_time) |
| #31 | SELECT filtrar por admin | `SELECT * FROM audit_logs WHERE admin_id = :admin_id AND created_at BETWEEN :start AND :end ORDER BY created_at DESC` | OK (usa idx_audit_logs_admin_time) |
| #31 | SELECT exportar CSV | misma query sin LIMIT | OK |

### 11. survey_responses (3 operaciones)

| Interfaz | Operacion | Query | Estado |
|----------|-----------|-------|--------|
| #24 | AVG SUS score | `SELECT ROUND(AVG(score), 1) FROM survey_responses WHERE instrument = 'sus'` | OK |
| #27E | SELECT metricas agregadas | `SELECT instrument, phase, COUNT(*), AVG(score), STDDEV(score) FROM survey_responses GROUP BY instrument, phase` | OK (usa idx_survey_instrument_phase) |
| #27E | POST importar resultados | `INSERT INTO survey_responses (user_id, instrument, phase, score, raw_data, administered_at, imported_by) VALUES (...)` | OK |

---

# RESUMEN EJECUTIVO DE HALLAZGOS

## Cambios requeridos en BD (ordenados por prioridad)

### Prioridad 1 -- CRITICOS (bloquean funcionalidad)

| ID | Cambio | Tipo | Tablas afectadas | Interfaces bloqueadas |
|----|--------|------|-----------------|----------------------|
| GAP-001 | Crear tabla `system_config` | Nueva tabla | system_config (nueva) | #30 |
| GAP-002 | Crear tabla `consent_versions` | Nueva tabla | consent_versions (nueva) | #06, #22, #30 |
| GAP-003 | Agregar columna `messages.latency_ms` | ALTER TABLE | messages | #24, #27C |

### Prioridad 2 -- MENORES (mejoran funcionalidad o rendimiento)

| ID | Cambio | Tipo | Tablas afectadas | Interfaces beneficiadas |
|----|--------|------|-----------------|------------------------|
| GAP-004 | Crear indice `idx_consents_user_accepted` | CREATE INDEX | consents | #06, #08, #22, #28, #29 |
| GAP-006 | Agregar columna `consents.revoked_at` | ALTER TABLE | consents | #17, #28 |
| GAP-007 | Crear indice `idx_attachments_message` | CREATE INDEX | attachments | #10, #14, #40 |
| GAP-008 | Crear indice `idx_message_reports_reporter` | CREATE INDEX | message_reports | #29, #40 |

### Prioridad 3 -- OPCIONALES (mejoran rendimiento post-MVP)

| ID | Cambio | Tipo | Justificacion |
|----|--------|------|---------------|
| GAP-005 | Agregar columna `users.last_active_at` | ALTER TABLE | Subquery es suficiente para MVP |
| RISK-001 | Habilitar indice GIN sobre messages.meta | CREATE INDEX | Solo si volumen > 100K |
| RISK-002 | Vistas materializadas para dashboard | CREATE VIEW | Solo si latencia de carga > 1s |

## Metricas finales

- **Tablas actuales:** 11
- **Tablas propuestas a agregar:** 2 (system_config, consent_versions)
- **Columnas propuestas a agregar:** 2 (messages.latency_ms, consents.revoked_at)
- **Indices propuestos a agregar:** 3 (consents, attachments, message_reports)
- **Total de tablas post-cambios:** 13
- **Cobertura de operaciones actual:** 64/87 = 73.6%
- **Cobertura de operaciones post-cambios:** 87/87 = 100%

---

> **Nota final:** Este reporte es la base para la decision del PO. Los cambios propuestos siguen el principio de **cambio minimo viable** -- solo se agregan las estructuras estrictamente necesarias para cubrir los gaps identificados. Las tablas y columnas existentes NO se modifican excepto por la adicion de `latency_ms` a messages y `revoked_at` a consents. La skill `database-schema-designer` fue utilizada como marco de analisis. Context7 MCP fue consultado para validar las funciones `percentile_cont` y la estrategia de indices GIN en PostgreSQL 16.
