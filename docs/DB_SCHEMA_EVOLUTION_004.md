# Evolucion del Esquema de BD -- 004

> **Proyecto:** Mabel IA -- Asistente de Psicoeducacion para Salud Mental Estudiantil UMB
> **Agente:** 03 -- Database Engineer
> **Fecha:** 2026-02-23
> **Motor:** PostgreSQL 16 (unico motor)
> **Fuente de verdad:** `db/schema_postgresql.sql`
> **Origen de cambios:** Validacion exhaustiva de 87 operaciones de datos contra 42 interfaces MVP
> **Decisiones PO:** PO-Q1 (revocacion con bloqueo temporal), PO-Q2 (placeholder consentimiento), PO-Q3 (keywords tecnicas)
> **Aprobado por:** Agente 02 (Software Architect)

---

## 1. Resumen Ejecutivo

| Metrica | Antes (Evo 003) | Despues (Evo 004) | Delta |
|---------|-----------------|-------------------|-------|
| Tablas | 11 | 13 | +2 |
| Columnas totales | 86 | 102 | +16 |
| CHECK constraints | 12 | 13 | +1 |
| Indices explicitos | 14 | 19 | +5 |
| UNIQUE constraints/indices | 4 | 6 | +2 |
| Foreign Keys | 13 | 16 | +3 |
| Secciones DDL | 7 | 8 | +1 |

**Cambios aplicados:** 5 cambios derivados de la validacion cruzada entre 87 operaciones de datos del catalogo de interfaces MVP y el esquema de BD.

**Tablas nuevas:** `consent_versions` (8 columnas), `system_config` (6 columnas)

**Tablas modificadas:** `consents` (+2 columnas: revoked_at, consent_version_id NOT NULL; -1 columna: version eliminada por redundancia; +1 UNIQUE constraint), `messages` (+1 columna: latency_ms)

**Tablas NO modificadas:** users, preferences, sessions, message_reports, attachments, safety_events, password_reset_tokens, audit_logs, survey_responses

---

## 2. Detalle por Cambio

---

### CAMBIO 1 -- Nueva tabla: `consent_versions`

**Requisito origen:** Interfaz #06 (Consentimiento Informado) + Ley 1581/2012 (consentimiento versionado) + Decision PO-Q2 (placeholder de consentimiento)

**Justificacion tecnica:**
- La Ley 1581/2012 exige consentimiento informado explicito, con trazabilidad de versiones. El sistema debe poder rastrear que version del documento de consentimiento acepto cada usuario, y permitir al admin publicar nuevas versiones cuando cambian los terminos.
- La interfaz #06 muestra un documento de consentimiento cuya version y contenido pueden cambiar a lo largo del tiempo. Sin una tabla `consent_versions`, el sistema no puede diferenciar entre versiones del documento ni forzar re-aceptacion cuando se publica una nueva version.
- El flujo de 3 estados del documento es: `draft` (en preparacion, no visible para estudiantes) -> `active` (publicado, es la version vigente) -> `archived` (reemplazado por una nueva version). Solo puede haber una version `active` a la vez; el indice parcial `idx_consent_versions_active` optimiza esta consulta frecuente.
- `version` es UNIQUE para evitar duplicados (ej: "v1.0", "v2.0").
- `title` (NOT NULL) almacena el titulo del documento de consentimiento.
- `body` (NOT NULL) almacena el texto legal completo del consentimiento. La Ley 1581/2012 exige que el texto integro sea almacenado en BD, no como URL externa (Decision PO-Q2).
- `created_by` (FK a users ON DELETE SET NULL) registra que admin creo la version (trazabilidad).
- La tabla se define ANTES de `consents` en el DDL porque `consents.consent_version_id` la referencia.

**SQL aplicado:**
```sql
CREATE TABLE consent_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'archived')),
  published_at  TIMESTAMP,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_consent_versions_active ON consent_versions(status)
                                         WHERE status = 'active';
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| TEXT o UUID para version? | TEXT | Las etiquetas son semanticas ("v1.0", "v2.0"), no identificadores opacos. UNIQUE garantiza unicidad. |
| CHECK en status con 3 valores? | SI | El workflow de publicacion tiene exactamente 3 estados bien definidos. Un nuevo estado requiere ALTER TABLE, lo cual es aceptable para un flujo tan estable. |
| title y body NOT NULL? | SI | La Ley 1581/2012 exige almacenar el texto integro del consentimiento en BD (Decision PO-Q2). title es el nombre del documento; body contiene el texto legal completo. En MVP se usa un placeholder. |
| Indice parcial en status? | SI | La consulta "cual es la version activa" es la mas frecuente y solo deberia retornar 1 fila. El indice parcial WHERE status = 'active' es optimo. |

**Riesgos evaluados:**
- Si se necesita mas de una version `active` simultanea (ej: A/B testing de consentimientos), el modelo actual no lo soporta. Para MVP esto no es un requisito. Post-MVP se podria agregar una columna `effective_from` / `effective_until` para rangos de vigencia.

---

### CAMBIO 2 -- Nueva tabla: `system_config`

**Requisito origen:** Interfaz #30 (Panel Configuracion del Sistema Admin) + Decision PO-Q3 (keywords tecnicas en configuracion)

**Decision de arbitraje:** TEXT PK en lugar de UUID PK. Las claves de configuracion son identificadores semanticos conocidos en codigo (`consent_current_version`, `sos_hotline_number`, `system_maintenance_mode`, etc.). Un UUID PK agregaria una indirection innecesaria: el backend siempre busca por clave, no por UUID.

**Justificacion tecnica:**
- El panel #30 permite al admin ajustar configuraciones globales del sistema: numero de telefono SOS, modo mantenimiento, version de consentimiento vigente, parametros del LLM, etc.
- Patron key-value con JSONB para el valor permite flexibilidad: un valor puede ser un string, un numero, un boolean, un array o un objeto JSON. La validacion del tipo especifico se hace en la capa de aplicacion (Pydantic).
- `updated_by` (FK a users ON DELETE SET NULL) registra que admin realizo el ultimo cambio (trazabilidad para auditoria).
- `description` es un campo descriptivo para que el admin entienda el proposito de cada configuracion en el panel #30.
- Sin UUID PK: la tabla tiene un maximo estimado de 10-20 filas. TEXT PK con claves semanticas es mas eficiente para lookup y mas legible en logs y auditoria.

**SQL aplicado:**
```sql
CREATE TABLE system_config (
  key          TEXT PRIMARY KEY,
  value        JSONB NOT NULL,
  description  TEXT,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| UUID PK o TEXT PK? | TEXT PK | Decision del arbitraje. Las claves son fijas y semanticas. SELECT por key es O(1) con PK. No hay JOIN con otras tablas que use esta PK. |
| Indice adicional? | NO | TEXT PK ya es un indice B-Tree. Con 10-20 filas, ningun indice adicional es necesario. |
| CHECK en key con valores fijos? | NO | Las claves de configuracion pueden crecer con nuevas funcionalidades. Validar en la capa de aplicacion. |
| Trigger para updated_at? | NO | El backend actualiza updated_at explicitamente. Un trigger agregaria complejidad sin beneficio en MVP. |

**Seeds propuestos (documentados, NO incluidos en DDL):**
```sql
-- Estos seeds se ejecutan via script separado o endpoint de inicializacion
INSERT INTO system_config (key, value, description) VALUES
  ('consent_current_version', '"v1.0"', 'Version vigente del consentimiento informado'),
  ('sos_hotline_number', '"106"', 'Numero de linea de crisis (Linea 106 Colombia)'),
  ('system_maintenance_mode', 'false', 'Modo mantenimiento activo/inactivo'),
  ('max_session_duration_minutes', '60', 'Duracion maxima de una sesion de chat en minutos'),
  ('llm_temperature', '0.7', 'Temperatura del modelo LLM para generacion de respuestas'),
  ('tts_default_voice', '"es-CO-female-01"', 'Voz TTS por defecto para nuevos usuarios');
```

**Riesgos evaluados:**
- Sin validacion de tipos en BD: el campo `value` es JSONB libre. Un admin podria insertar un valor con tipo incorrecto (ej: string donde se espera numero). Mitigacion: validacion estricta en la capa de aplicacion con Pydantic schemas por clave.
- Sin historial de cambios en la tabla: los cambios de configuracion se rastrean via `audit_logs` (accion 'change_config'). La tabla system_config solo almacena el valor actual.

---

### CAMBIO 3 -- Nueva columna: `messages.latency_ms`

**Requisito origen:** Criterio de exito del proyecto (latencia mediana <= 20s por turno) + Interfaz #27D (Tab D -- Metricas de Rendimiento)

**Justificacion tecnica:**
- El proyecto tiene un criterio de exito explicito: latencia mediana por turno <= 20 segundos. Para medir esto, cada mensaje de tipo `assistant` debe registrar cuanto tardo en generarse.
- `latency_ms INT` almacena la latencia en milisegundos (entero). Un INT de 4 bytes es mas eficiente que JSONB para una metrica unica y numerica que se consultara con funciones de agregacion (AVG, PERCENTILE_CONT, etc.).
- Se eligio columna dedicada en lugar de almacenar en el campo `meta` JSONB existente porque: (a) las queries de metricas (#27D) necesitan filtrar y agregar por latencia frecuentemente, (b) un indice B-Tree en INT es mas eficiente que un indice GIN en JSONB para este patron de acceso, (c) la semantica es mas clara.
- El campo es nullable: solo los mensajes con role='assistant' tendran valor. Los mensajes de usuario y sistema no tienen latencia LLM.

**SQL aplicado:**
```sql
-- Dentro de CREATE TABLE messages:
latency_ms INT,

-- Indice parcial para consultas de metricas:
CREATE INDEX idx_messages_latency ON messages(latency_ms)
                                  WHERE role = 'assistant' AND latency_ms IS NOT NULL;
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| INT o BIGINT? | INT | Maximo 2,147,483,647 ms (~24 dias). Imposible que una respuesta tarde mas de unos minutos. INT de 4 bytes es suficiente. |
| Columna dedicada o meta JSONB? | Columna dedicada | Consultas de metricas frecuentes (AVG, percentiles), indice B-Tree eficiente, semantica clara. JSONB requiere extraer con ->> y castear, con indice GIN menos eficiente para rangos. |
| Nullable o NOT NULL DEFAULT 0? | Nullable | Solo tiene sentido para role='assistant'. Un DEFAULT 0 seria enganoso para mensajes de usuario (0 ms no es "sin latencia", es "latencia desconocida"). NULL semanticamente correcto. |

**Indice:**
- `idx_messages_latency` (parcial WHERE role = 'assistant' AND latency_ms IS NOT NULL): Optimiza las queries del panel de metricas #27D que calculan latencia promedio, mediana y percentiles. Excluye mensajes de usuario/sistema y mensajes sin latencia registrada, reduciendo el tamano del indice.

**Riesgos evaluados:**
- Si se necesitan mas metricas de rendimiento por mensaje (ej: tokens_per_second, model_name), se podrian agregar como columnas adicionales o almacenar en `meta`. Para MVP, solo latencia_ms es requerido por los criterios de exito.

---

### CAMBIO 4 -- Nuevas columnas en `consents`: revoked_at, consent_version_id

**Requisito origen:** Decision PO-Q1 (revocacion con bloqueo temporal) + Interfaz #06 (Consentimiento) + Ley 1581/2012 (derecho de revocacion)

**Justificacion tecnica:**

**4a. `revoked_at TIMESTAMP` (nullable)**
- La Ley 1581/2012 establece el derecho del titular a revocar su consentimiento en cualquier momento. El campo `revoked_at` registra cuando el usuario revoco su aceptacion.
- Semantica de 3 estados del consentimiento:
  - `revoked_at IS NULL` AND existe registro = consentimiento vigente (activo)
  - `revoked_at IS NOT NULL` = consentimiento revocado
  - No existe registro para el usuario = nunca ha aceptado
- Decision PO-Q1 establece que al revocar, el sistema bloquea la interaccion (el estudiante no puede chatear) hasta que acepte la version vigente nuevamente. La revocacion NO elimina el registro (se preserva para auditoria); marca el timestamp de revocacion.

**4b. `consent_version_id UUID NOT NULL REFERENCES consent_versions(id) ON DELETE RESTRICT`**
- Vincula cada aceptacion de consentimiento con la version especifica del documento que el usuario acepto. NOT NULL porque todo registro de consentimiento DEBE estar vinculado a una version del documento. Esto es esencial para trazabilidad legal: ante una auditoria, se puede demostrar exactamente que texto acepto cada usuario y cuando.
- ON DELETE RESTRICT: impide eliminar una version de consentimiento que tenga aceptaciones asociadas. Esto protege la integridad del registro legal. Las versiones obsoletas se marcan como `archived`, nunca se eliminan.
- **Corrección post-auditoría (2026-02-24):** El campo legacy `consents.version` (TEXT NOT NULL) fue eliminado por redundancia. La version textual se obtiene via JOIN con `consent_versions.version`. Mantener ambos campos creaba riesgo de desincronización sin beneficio, dado que el proyecto está en pre-desarrollo sin código existente. Decisión del Agente 02 (Arquitecto).

**4c. UNIQUE (user_id, consent_version_id)**
- Un usuario no puede tener dos registros activos para la misma version de consentimiento. Si revoca y re-acepta la misma version, el backend usa UPDATE (SET revoked_at = NULL, accepted_at = CURRENT_TIMESTAMP) en el registro existente, en lugar de INSERT. Esto preserva el constraint UNIQUE y la trazabilidad. Los eventos de revocacion y re-aceptacion se registran en audit_logs para cumplimiento legal. Nota: este constraint permite multiples (user_id, NULL) ya que PostgreSQL trata NULLs como distintos en UNIQUE constraints, lo cual es correcto para registros legacy sin consent_version_id.

**SQL aplicado:**
```sql
-- Dentro de CREATE TABLE consents:
-- ELIMINADO: version TEXT NOT NULL (redundante con consent_version_id, correccion post-auditoria)
revoked_at          TIMESTAMP,
consent_version_id  UUID NOT NULL REFERENCES consent_versions(id) ON DELETE RESTRICT,

CONSTRAINT uq_consents_user_version
  UNIQUE (user_id, consent_version_id)
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| ON DELETE CASCADE o RESTRICT para consent_version_id? | RESTRICT | Impide la eliminacion accidental de versiones con aceptaciones. Las versiones se archivan, no se eliminan. Proteccion legal. |
| Eliminar campo `version` existente? | **SI** (corregido post-auditoría) | Inicialmente se mantuvo por "cambio mínimo viable", pero la auditoría post-Evo004 determinó que en pre-desarrollo sin código existente, el costo de eliminar es cero y el riesgo de desincronización es real. `consent_version_id NOT NULL` + JOIN es la fuente única de verdad. |
| Indice en consent_version_id? | NO (por ahora) | Las consultas principales son "consentimiento mas reciente de un usuario" (cubierto por idx_consents_user_latest) y "aceptaciones de una version" (poco frecuente, tabla pequena). |

**Riesgos evaluados:**
- ~~Doble-representacion de version~~ **Resuelto:** El campo legacy `version` TEXT fue eliminado en la corrección post-auditoría. `consent_version_id NOT NULL` es la única referencia a la versión del documento.
- Re-aceptacion post-revocacion: el UNIQUE constraint (user_id, consent_version_id) impide INSERT de un segundo registro para la misma version. La re-aceptacion se maneja via UPDATE del registro existente (SET revoked_at = NULL). Los audit_logs registran ambos eventos.

---

### CAMBIO 5 -- Indices nuevos

5 indices nuevos distribuidos en las tablas correspondientes:

| # | Indice | Tabla | Tipo | Justificacion |
|---|--------|-------|------|---------------|
| 1 | `idx_consent_versions_active` | consent_versions | B-Tree parcial (WHERE status = 'active') | Optimiza la consulta "version activa del consentimiento" que se ejecuta en cada login y aceptacion. Solo indexa las filas con status='active' (tipicamente 1 fila). |
| 2 | `idx_messages_latency` | messages | B-Tree parcial (WHERE role = 'assistant' AND latency_ms IS NOT NULL) | Soporta las queries de metricas de rendimiento (#27D): AVG, percentiles de latencia. Excluye mensajes sin latencia. |
| 3 | `idx_consents_user_latest` | consents | B-Tree composite (user_id, accepted_at DESC) | Optimiza la consulta "consentimiento mas reciente de un usuario" que se ejecuta en cada verificacion de acceso. DESC para paginacion "mas reciente primero". |
| 4 | `idx_attachments_message` | attachments | B-Tree (message_id) | Indice en FK message_id. Toda FK debe tener indice para evitar full table scans en JOINs y en cascadas de DELETE. Faltaba en evoluciones anteriores. |
| 5 | `idx_message_reports_reporter` | message_reports | B-Tree (reporter_id) | Indice en FK reporter_id. Soporta consultas "reportes de un usuario" y optimiza ON DELETE CASCADE cuando se elimina un usuario. Faltaba en evoluciones anteriores. |

**Nota sobre indices faltantes corregidos:** Los indices #4 y #5 corrigen omisiones de evoluciones anteriores. La convencion del proyecto es indexar toda FK explicita. Las FK `attachments.message_id` y `message_reports.reporter_id` existian sin indice desde el esquema base.

---

## 3. Estado Post-Cambio

### 3.1 Inventario de tablas (13 totales)

| # | Tabla | Seccion | Estado |
|---|-------|---------|--------|
| 1 | users | Usuarios y Privacidad | Sin cambios |
| 2 | consent_versions | Usuarios y Privacidad | NUEVA |
| 3 | consents | Usuarios y Privacidad | MODIFICADA (+2 cols, +1 UNIQUE) |
| 4 | preferences | Usuarios y Privacidad | Sin cambios |
| 5 | sessions | Sesiones y Mensajes | Sin cambios |
| 6 | messages | Sesiones y Mensajes | MODIFICADA (+1 col) |
| 7 | message_reports | Reportes de Mensajes | Sin cambios (+ 1 indice) |
| 8 | attachments | Adjuntos y Eventos | Sin cambios (+ 1 indice) |
| 9 | safety_events | Adjuntos y Eventos | Sin cambios |
| 10 | password_reset_tokens | Autenticacion | Sin cambios |
| 11 | audit_logs | Auditoria | Sin cambios |
| 12 | survey_responses | Investigacion | Sin cambios |
| 13 | system_config | Configuracion del Sistema | NUEVA |

### 3.2 Inventario de indices explicitos (19 totales)

| # | Indice | Tabla | Tipo | Nuevo? |
|---|--------|-------|------|--------|
| 1 | idx_consent_versions_active | consent_versions | B-Tree parcial | SI |
| 2 | idx_consents_user_latest | consents | B-Tree composite | SI |
| 3 | idx_sessions_user_time | sessions | B-Tree composite | No |
| 4 | idx_messages_session_time | messages | B-Tree composite | No |
| 5 | idx_messages_latency | messages | B-Tree parcial | SI |
| 6 | uq_message_reports_msg_user | message_reports | UNIQUE composite | No |
| 7 | idx_message_reports_status | message_reports | B-Tree | No |
| 8 | idx_message_reports_msg_time | message_reports | B-Tree composite | No |
| 9 | idx_message_reports_reporter | message_reports | B-Tree | SI |
| 10 | idx_attachments_message | attachments | B-Tree | SI |
| 11 | idx_safety_events_user_time | safety_events | B-Tree composite | No |
| 12 | idx_safety_events_type | safety_events | B-Tree | No |
| 13 | idx_safety_events_status | safety_events | B-Tree | No |
| 14 | idx_prt_user_created | password_reset_tokens | B-Tree composite | No |
| 15 | idx_prt_token_active | password_reset_tokens | B-Tree parcial | No |
| 16 | idx_audit_logs_admin_time | audit_logs | B-Tree composite | No |
| 17 | idx_audit_logs_action_time | audit_logs | B-Tree composite | No |
| 18 | idx_survey_instrument_phase | survey_responses | B-Tree composite | No |
| 19 | idx_survey_user | survey_responses | B-Tree parcial | No |

### 3.3 Inventario de CHECK constraints (13 totales)

| # | Constraint | Tabla | Nuevo? |
|---|-----------|-------|--------|
| 1 | role IN ('student', 'admin') | users | No |
| 2 | chk_users_disabled_reason | users | No |
| 3 | status IN ('draft', 'active', 'archived') | consent_versions | SI |
| 4 | scope IN ('solo_uso','uso_mejora_anon') | consents | No |
| 5 | preferred_chat_mode IN ('chat', 'avatar') | preferences | No |
| 6 | role IN ('system','user','assistant') | messages | No |
| 7 | reason IN ('hallucination','harmful','privacy','low_empathy','other') | message_reports | No |
| 8 | status IN ('open','triaged','resolved','dismissed') | message_reports | No |
| 9 | severity IS NULL OR (severity >= 1 AND severity <= 5) | message_reports | No |
| 10 | kind IN ('audio','image','doc') | attachments | No |
| 11 | status IN ('active', 'reviewed', 'resolved') | safety_events | No |
| 12 | instrument IN ('sus', 'empathy_rubric', 'wellbeing_pre', 'wellbeing_post') | survey_responses | No |
| 13 | phase IN ('pre', 'post') | survey_responses | No |

### 3.4 Inventario de UNIQUE constraints (6 totales)

| # | Constraint/Indice | Tabla | Tipo | Nuevo? |
|---|-------------------|-------|------|--------|
| 1 | users.email UNIQUE | users | Inline | No |
| 2 | consent_versions.version UNIQUE | consent_versions | Inline | SI |
| 3 | uq_consents_user_version (user_id, consent_version_id) | consents | Table constraint | SI |
| 4 | uq_message_reports_msg_user (message_id, reporter_id) | message_reports | UNIQUE INDEX | No |
| 5 | password_reset_tokens.token_hash UNIQUE | password_reset_tokens | Inline | No |
| 6 | uq_survey_user_instrument_phase (user_id, instrument, phase) | survey_responses | Table constraint | No |

### 3.5 Inventario de Foreign Keys (16 totales)

| # | FK | Tabla origen | Tabla destino | ON DELETE | Nuevo? |
|---|----|--------------|--------------|-----------| -------|
| 1 | consents.user_id | consents | users | CASCADE | No |
| 2 | consents.consent_version_id | consents | consent_versions | RESTRICT | SI |
| 3 | consent_versions.created_by | consent_versions | users | SET NULL | SI |
| 4 | preferences.user_id | preferences | users | CASCADE | No |
| 5 | sessions.user_id | sessions | users | CASCADE | No |
| 6 | messages.session_id | messages | sessions | CASCADE | No |
| 7 | message_reports.message_id | message_reports | messages | CASCADE | No |
| 8 | message_reports.reporter_id | message_reports | users | CASCADE | No |
| 9 | attachments.message_id | attachments | messages | CASCADE | No |
| 10 | safety_events.user_id | safety_events | users | CASCADE | No |
| 11 | safety_events.session_id | safety_events | sessions | SET NULL | No |
| 12 | password_reset_tokens.user_id | password_reset_tokens | users | CASCADE | No |
| 13 | audit_logs.admin_id | audit_logs | users | SET NULL | No |
| 14 | survey_responses.user_id | survey_responses | users | SET NULL | No |
| 15 | survey_responses.imported_by | survey_responses | users | SET NULL | No |
| 16 | system_config.updated_by | system_config | users | SET NULL | SI |

---

## 4. Seeds Propuestos (NO incluidos en DDL)

Los siguientes seeds se ejecutaran via script separado (`db/seeds.sql`) o endpoint de inicializacion:

### 4.1 consent_versions -- Placeholder de consentimiento (Decision PO-Q2)

```sql
INSERT INTO consent_versions (version, title, body, status, published_at)
VALUES (
  'v1.0',
  'Consentimiento Informado — Mabel IA v1.0',
  'Consentimiento informado inicial para el uso del asistente virtual Mabel IA. '
  'Incluye: proposito del sistema, tipos de datos recolectados, derechos del titular '
  'segun Ley 1581/2012, y condiciones de participacion en el estudio. '
  '[Texto legal completo pendiente de redaccion por equipo juridico]',
  'active',
  CURRENT_TIMESTAMP
);
```

### 4.2 system_config -- Configuracion inicial del sistema

```sql
INSERT INTO system_config (key, value, description) VALUES
  ('consent_current_version', '"v1.0"',
   'Version vigente del consentimiento informado'),
  ('sos_hotline_number', '"106"',
   'Numero de linea de crisis (Linea 106 Colombia)'),
  ('system_maintenance_mode', 'false',
   'Modo mantenimiento activo/inactivo'),
  ('max_session_duration_minutes', '60',
   'Duracion maxima de una sesion de chat en minutos'),
  ('llm_temperature', '0.7',
   'Temperatura del modelo LLM para generacion de respuestas'),
  ('tts_default_voice', '"es-CO-female-01"',
   'Voz TTS por defecto para nuevos usuarios');
```

---

## 5. Impacto en Interfaces

Las siguientes interfaces ahora tienen cobertura 100% en el esquema de BD:

| Interfaz | Operacion cubierta | Tabla(s) involucrada(s) |
|----------|--------------------|-------------------------|
| #06 Consentimiento Informado | Versionado de documento, aceptacion con FK, revocacion | consent_versions, consents |
| #08 Preferencias (revocacion) | Revocar consentimiento con bloqueo temporal | consents.revoked_at |
| #10 Chat (latencia) | Medir latencia por turno para metricas | messages.latency_ms |
| #27D Metricas Rendimiento | Consultar latencia promedio/mediana/percentiles | messages.latency_ms + idx_messages_latency |
| #30 Configuracion del Sistema | CRUD de parametros globales | system_config |
| #31 Panel Auditoria | Trazabilidad de cambios en configuracion | system_config.updated_by + audit_logs |

**Interfaces previamente sin cobertura BD que ahora estan cubiertas:**
- Versionado de consentimiento (consent_versions): cubre el flujo completo de publicacion, aceptacion y revocacion
- Configuracion del sistema (system_config): cubre el panel admin #30 para ajustes globales
- Metricas de rendimiento (messages.latency_ms): cubre el criterio de exito de latencia y el tab de metricas #27D

---

## 6. Diagrama ER (Mermaid)

```mermaid
erDiagram
    users {
        UUID id PK
        TEXT email UK
        TEXT hashed_password
        TEXT display_name
        TEXT role
        TIMESTAMP disabled_at
        TEXT disabled_reason
        TIMESTAMP created_at
        TIMESTAMP deleted_at
    }

    consent_versions {
        UUID id PK
        TEXT version UK
        TEXT title
        TEXT body
        TEXT status
        TIMESTAMP published_at
        UUID created_by FK
        TIMESTAMP created_at
    }

    consents {
        UUID id PK
        UUID user_id FK
        TEXT scope
        TIMESTAMP accepted_at
        TIMESTAMP revoked_at
        UUID consent_version_id FK
    }

    preferences {
        UUID user_id PK_FK
        BOOLEAN save_history
        TEXT ui_language
        TEXT tts_voice
        JSONB accessibility
        BOOLEAN checkin_enabled
        TEXT preferred_chat_mode
    }

    sessions {
        UUID id PK
        UUID user_id FK
        TIMESTAMP started_at
        TIMESTAMP ended_at
        TEXT topic_hint
        JSONB meta
        BOOLEAN checkin_opt_in
        JSONB checkin_payload
        TIMESTAMP checkin_completed_at
        BOOLEAN avatar_used
    }

    messages {
        UUID id PK
        UUID session_id FK
        TEXT role
        TEXT content
        TEXT content_sha256
        JSONB meta
        JSONB safety_flags
        INT tokens_prompt
        INT tokens_completion
        INT latency_ms
        TIMESTAMP created_at
    }

    message_reports {
        UUID id PK
        UUID message_id FK
        UUID reporter_id FK
        TEXT reason
        TEXT details
        TEXT status
        INT severity
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    attachments {
        UUID id PK
        UUID message_id FK
        TEXT kind
        TEXT path
        JSONB meta
        TIMESTAMP created_at
    }

    safety_events {
        UUID id PK
        UUID user_id FK
        UUID session_id FK
        TEXT event_type
        JSONB payload
        TEXT status
        TIMESTAMP created_at
    }

    password_reset_tokens {
        UUID id PK
        UUID user_id FK
        TEXT token_hash UK
        TIMESTAMP expires_at
        TIMESTAMP used_at
        TIMESTAMP created_at
    }

    audit_logs {
        UUID id PK
        UUID admin_id FK
        TEXT action
        TEXT target_type
        UUID target_id
        JSONB detail
        TEXT ip_address
        TIMESTAMP created_at
    }

    survey_responses {
        UUID id PK
        UUID user_id FK
        TEXT instrument
        TEXT phase
        NUMERIC score
        JSONB raw_data
        TIMESTAMP administered_at
        TIMESTAMP imported_at
        UUID imported_by FK
    }

    system_config {
        TEXT key PK
        JSONB value
        TEXT description
        UUID updated_by FK
        TIMESTAMP updated_at
        TIMESTAMP created_at
    }

    users ||--o{ consents : "acepta"
    users ||--o| preferences : "configura"
    users ||--o{ sessions : "inicia"
    users ||--o{ safety_events : "genera"
    users ||--o{ password_reset_tokens : "solicita"
    users ||--o{ audit_logs : "ejecuta"
    users ||--o{ survey_responses : "responde"
    users ||--o{ consent_versions : "crea"
    users ||--o{ system_config : "actualiza"
    consent_versions ||--o{ consents : "referencia"
    sessions ||--o{ messages : "contiene"
    sessions ||--o{ safety_events : "asocia"
    messages ||--o{ message_reports : "recibe"
    messages ||--o{ attachments : "adjunta"
    users ||--o{ message_reports : "reporta"
    users ||--o{ survey_responses : "importa"
```

---

## 7. Verificacion de Integridad

### 7.1 CHECK constraints originales preservados

- [x] `users.role IN ('student', 'admin')` -- SIN CAMBIOS
- [x] `chk_users_disabled_reason` -- SIN CAMBIOS
- [x] `consents.scope IN ('solo_uso','uso_mejora_anon')` -- SIN CAMBIOS
- [x] `preferences.preferred_chat_mode IN ('chat', 'avatar')` -- SIN CAMBIOS
- [x] `messages.role IN ('system','user','assistant')` -- SIN CAMBIOS
- [x] `message_reports.reason IN (...)` -- SIN CAMBIOS
- [x] `message_reports.status IN (...)` -- SIN CAMBIOS
- [x] `message_reports.severity IS NULL OR (...)` -- SIN CAMBIOS
- [x] `attachments.kind IN ('audio','image','doc')` -- SIN CAMBIOS
- [x] `safety_events.status IN ('active', 'reviewed', 'resolved')` -- SIN CAMBIOS
- [x] `survey_responses.instrument IN (...)` -- SIN CAMBIOS
- [x] `survey_responses.phase IN ('pre', 'post')` -- SIN CAMBIOS

### 7.2 FK y cascadas originales preservadas

- [x] consents.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] preferences.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] sessions.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] messages.session_id -> sessions(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] message_reports.message_id -> messages(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] message_reports.reporter_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] attachments.message_id -> messages(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] safety_events.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] safety_events.session_id -> sessions(id) ON DELETE SET NULL -- SIN CAMBIOS
- [x] password_reset_tokens.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] audit_logs.admin_id -> users(id) ON DELETE SET NULL -- SIN CAMBIOS
- [x] survey_responses.user_id -> users(id) ON DELETE SET NULL -- SIN CAMBIOS
- [x] survey_responses.imported_by -> users(id) ON DELETE SET NULL -- SIN CAMBIOS

### 7.3 Nuevas FK correctamente referenciadas

- [x] consent_versions.created_by -> users(id) ON DELETE SET NULL
- [x] consents.consent_version_id -> consent_versions(id) ON DELETE RESTRICT
- [x] system_config.updated_by -> users(id) ON DELETE SET NULL

### 7.4 Orden de CREATE TABLE respeta dependencias FK

1. users (sin dependencias)
2. consent_versions (depende de users via created_by)
3. consents (depende de users, consent_versions)
4. preferences (depende de users)
5. sessions (depende de users)
6. messages (depende de sessions)
7. message_reports (depende de messages, users)
8. attachments (depende de messages)
9. safety_events (depende de users, sessions)
10. password_reset_tokens (depende de users)
11. audit_logs (depende de users)
12. survey_responses (depende de users)
13. system_config (depende de users)

---

## 8. Conteo Final de Elementos del Esquema

| Elemento | Cantidad |
|----------|----------|
| Extension (pgcrypto) | 1 |
| Tablas | 13 |
| Columnas totales | 103 |
| Primary Keys | 13 |
| Foreign Keys | 16 |
| UNIQUE constraints/indices | 6 |
| CHECK constraints | 13 |
| Indices explicitos (sin PK) | 19 |
| Secciones DDL | 8 |

---

## 9. Nota Tecnica: Convenciones Mantenidas

- **TIMESTAMP sin zona horaria:** Consistente con las 11 tablas anteriores. Conversion a hora local (America/Bogota) en la capa de presentacion.
- **UUIDs via gen_random_uuid():** Todas las tablas con UUID PK mantienen este patron. Excepcion: `system_config` usa TEXT PK por decision de arbitraje.
- **ON DELETE SET NULL para FK de trazabilidad:** `consent_versions.created_by`, `system_config.updated_by`, `audit_logs.admin_id`, `survey_responses.user_id/imported_by`. Preserva el registro si el usuario es eliminado.
- **ON DELETE RESTRICT para integridad legal:** `consents.consent_version_id`. Impide eliminacion de versiones de consentimiento con aceptaciones asociadas.
- **Indentacion:** 2 espacios para columnas dentro de CREATE TABLE.
- **Naming:** snake_case, prefijo `idx_` para indices, `uq_` para UNIQUE constraints.
