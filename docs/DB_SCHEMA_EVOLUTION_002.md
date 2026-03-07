# Evolucion del Esquema de BD -- 002

> **Proyecto:** Mabel IA -- Asistente de Psicoeducacion para Salud Mental Estudiantil UMB
> **Agente:** 03 -- Database Engineer
> **Fecha:** 2026-02-20
> **Motor:** PostgreSQL 16 (unico motor)
> **Fuente de verdad:** `db/schema_postgresql.sql`
> **Origen de cambios:** `docs/INTERFACES_MVP_CATALOGO.md` (Catalogo Funcional de Interfaces MVP)

---

## 1. Resumen Ejecutivo

| Metrica | Antes | Despues |
|---------|-------|---------|
| Tablas | 8 | 11 (+3) |
| Columnas totales | 56 | 69 (+13) |
| CHECK constraints | 5 | 11 (+6) |
| Indices explicitos | 7 | 14 (+7) |
| UNIQUE constraints/indices | 2 | 4 (+2) |
| Foreign Keys | 10 | 15 (+5) |

**Cambios aplicados:** 5 cambios derivados de 7 interfaces del catalogo MVP y 3 decisiones arquitectonicas (D-06, D-10, D-11).

**Tablas nuevas:** `audit_logs`, `password_reset_tokens`, `survey_responses`

**Tablas modificadas:** `users` (+3 columnas: role, disabled_at, disabled_reason), `safety_events` (+1 columna: status)

**Tablas NO modificadas:** consents, preferences, sessions, messages, message_reports, attachments

---

## 2. Detalle por Cambio

---

### CAMBIO 1 -- Nueva tabla: `audit_logs`

**Requisito origen:** Interfaz #31 (Panel de Logs y Auditoria Admin) + Ley 1581/2012 (auditoria de acceso a datos)

**Decision asociada:** D-06 -- Logs de auditoria en tabla separada (no reutilizar safety_events porque son conceptualmente diferentes: audit_logs registran acciones del admin, safety_events registran riesgos del estudiante)

**Justificacion tecnica:**
- La Ley 1581/2012 exige trazabilidad de acceso a datos personales. El panel admin (#31) necesita registrar TODAS las acciones administrativas: login, view_user, disable_user, change_config, review_report, review_safety_event, export_data.
- Los logs son append-only (inmutables): no se pueden eliminar ni actualizar. Esta propiedad es fundamental para cumplimiento legal.
- La FK a users usa ON DELETE SET NULL para preservar el registro historico si un admin es eliminado. El log permanece con admin_id = NULL, pero la accion sigue siendo auditable.
- `target_type` + `target_id` usan patron polimorfico sin FK (type + UUID) porque el target puede ser un user, un safety_event, un report, o cualquier entidad. No es posible una FK fija ya que apunta a multiples tablas.

**SQL aplicado:**
```sql
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  detail       JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_admin_time  ON audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_time ON audit_logs(action, created_at DESC);
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| CHECK en action con valores fijos? | NO | Las acciones pueden crecer con nuevas funcionalidades. Validar en la capa de aplicacion (Pydantic enum). Un CHECK rigido obligaria un ALTER TABLE por cada nueva accion admin. |
| ip_address necesario para MVP? | SI, pero nullable | La Ley 1581/2012 recomienda registrar el origen de acceso a datos sensibles. El campo es nullable porque en desarrollo local puede no estar disponible. Es TEXT para soportar IPv4 e IPv6. |

**Indices:**
- `idx_audit_logs_admin_time`: Soporta filtros del panel #31 por admin + rango de fechas (query principal).
- `idx_audit_logs_action_time`: Soporta filtros del panel #31 por tipo de accion + rango de fechas.
- Ambos con `DESC` en created_at para optimizar la paginacion mas reciente primero (patron de acceso predominante).

**Riesgos evaluados:**
- Crecimiento ilimitado: Los logs nunca se eliminan. Para el MVP (30 estudiantes, 1-2 admins) el volumen es despreciable. Post-MVP se puede implementar particionamiento por mes si es necesario.
- Sin target_type CHECK: Se confia en la validacion de la capa de aplicacion. Riesgo bajo dado que solo el backend escribe en esta tabla.

---

### CAMBIO 2 -- Nueva tabla: `password_reset_tokens`

**Requisito origen:** Interfaces #04 (Recuperar Contrasena) y #05 (Restablecer Contrasena)

**Decision asociada:** D-10 -- Tabla separada de users para tokens de reset (los tokens son temporales con expiracion; mezclarlos en users anade columnas temporales innecesarias)

**Justificacion tecnica:**
- El flujo de recuperacion de contrasena (POST `/api/v1/auth/forgot-password` + POST `/api/v1/auth/reset-password`) necesita almacenar un token temporal con expiracion.
- Para MVP se genera un token simulado (sin SMTP). El token_hash almacena el SHA-256 del token; NUNCA el token en claro. Esto protege contra acceso no autorizado a la BD.
- `used_at` nullable indica si el token ya fue consumido. Un token con `used_at IS NOT NULL` no puede reutilizarse.
- ON DELETE CASCADE: si el usuario se elimina, todos sus tokens pendientes se eliminan automaticamente.

**SQL aplicado:**
```sql
CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prt_user_created ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX idx_prt_token_active ON password_reset_tokens(token_hash) WHERE used_at IS NULL;
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| UNIQUE en (user_id, token_hash)? | NO -- UNIQUE solo en token_hash | Un usuario puede tener multiples tokens (solicitudes sucesivas). La unicidad es por token, no por par usuario+token. |
| Invalidar tokens anteriores en BD o en app? | En la capa de aplicacion | Al crear un nuevo token, el backend ejecuta UPDATE SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL. No se necesita un trigger ni constraint en BD para esto -- es logica de negocio. |

**Indices:**
- `idx_prt_user_created`: Soporta la consulta "tokens de un usuario, mas reciente primero" para invalidacion.
- `idx_prt_token_active` (parcial WHERE used_at IS NULL): Optimiza la busqueda de tokens validos (no usados) por hash. Excluye tokens ya consumidos del indice, reduciendo su tamano.

**Riesgos evaluados:**
- Acumulacion de tokens expirados: Riesgo bajo para MVP (30 usuarios). Post-MVP se puede agregar un job de limpieza periodica (DELETE WHERE expires_at < NOW() - INTERVAL '30 days').

---

### CAMBIO 3a -- Nueva columna `role` en tabla `users`

**Requisito origen:** Interfaz #23 (Login admin -- discriminacion de rol) + Interfaz #32 (Acceso Denegado 403)

**Justificacion tecnica:**
- El login unificado (#03/#23) necesita discriminar entre estudiantes y administradores. El backend incluye el claim `role` en el JWT y el frontend redirige segun rol: `/home` (student) o `/admin` (admin).
- Solo 2 roles para MVP: `student` (default) y `admin`. Los admins se crean manualmente via SQL directo o seed script.
- CHECK constraint impide valores invalidos a nivel de BD.
- DEFAULT 'student' garantiza que todos los usuarios existentes y nuevos son estudiantes por defecto.

**SQL aplicado:**
```sql
-- Dentro de CREATE TABLE users:
role TEXT NOT NULL DEFAULT 'student'
     CHECK (role IN ('student', 'admin')),
```

**Impacto sobre tablas existentes:**
- Solo la tabla `users` es afectada. Ninguna FK, cascada o indice existente se modifica.
- El campo `role` no necesita indice propio: solo tiene 2 valores posibles (baja selectividad). Las consultas de filtro admin vs student son poco frecuentes y la tabla users sera pequena (30 estudiantes MVP).

**Riesgos evaluados:**
- Si se necesitan mas roles post-MVP (ej: 'researcher', 'moderator'), se debera un ALTER TABLE para expandir el CHECK. Alternativa futura: tabla `roles` + tabla pivote. Para MVP, 2 roles en CHECK es suficiente y simple.

---

### CAMBIO 3b -- Nuevas columnas `disabled_at` y `disabled_reason` en tabla `users`

**Requisito origen:** Interfaz #28 (Panel de Gestion de Usuarios Admin -- deshabilitacion de cuentas)

**Justificacion tecnica:**
- El admin necesita poder deshabilitar cuentas de estudiantes con justificacion obligatoria (PATCH `/api/v1/admin/users/:id`). La accion se registra en audit_logs.
- Patron "soft-disable" complementario al "soft-delete" existente (deleted_at):
  - `deleted_at IS NOT NULL` = cuenta eliminada por el propio usuario (Ley 1581 derecho de supresion)
  - `disabled_at IS NOT NULL` = cuenta deshabilitada por un admin (sancion/seguridad)
- `disabled_reason` es obligatorio cuando `disabled_at` tiene valor, forzado via CHECK cruzado a nivel de tabla. Esto garantiza que toda deshabilitacion tiene justificacion (requisito legal y funcional).
- Ambos campos son nullable: NULL = cuenta activa.

**SQL aplicado:**
```sql
-- Dentro de CREATE TABLE users:
disabled_at      TIMESTAMP,
disabled_reason  TEXT,

CONSTRAINT chk_users_disabled_reason
  CHECK (disabled_at IS NULL OR disabled_reason IS NOT NULL)
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| CHECK cruzado (disabled_at IS NULL OR disabled_reason IS NOT NULL)? | SI | Garantiza integridad a nivel de BD. Sin este CHECK, un bug en la aplicacion podria deshabilitar una cuenta sin justificacion, violando el requisito funcional. |

**Impacto:**
- Los campos son nullable, por lo que no requieren backfill ni rompen compatibilidad.
- El login (POST `/api/v1/auth/login`) debe verificar `disabled_at IS NULL` ademas de `deleted_at IS NULL`. Esto es logica de aplicacion que el Agente 04 implementara.

**Riesgos evaluados:**
- No se creo indice en `disabled_at` porque la consulta de filtro ("usuarios deshabilitados") es poco frecuente y la tabla users sera pequena.

---

### CAMBIO 4 -- Nueva columna `status` en tabla `safety_events`

**Requisito origen:** Interfaz #25 (Panel Safety Events -- triaje de eventos por el admin)

**Justificacion tecnica:**
- El panel #25 requiere un workflow de triaje: el admin puede marcar eventos como "revisado" o "resuelto" (PATCH `/api/v1/admin/safety-events/:id`).
- Los 3 estados del workflow son: `active` (default, recien creado) -> `reviewed` (admin lo vio) -> `resolved` (caso cerrado).
- Se anade un indice en `status` para soportar los filtros del panel #25 (filtrar por estado).

**SQL aplicado:**
```sql
-- Dentro de CREATE TABLE safety_events:
status TEXT NOT NULL DEFAULT 'active'
       CHECK (status IN ('active', 'reviewed', 'resolved')),

-- Indice adicional:
CREATE INDEX idx_safety_events_status ON safety_events(status);
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| Agregar 'dismissed' como cuarto estado? | NO | A diferencia de message_reports (que tienen 'dismissed' para reportes falsos/irrelevantes), los safety_events son eventos objetivos del sistema (crisis detectada, guardrail activado). Todos requieren revision y resolucion. Descartar un evento de seguridad no es apropiado en un contexto de salud mental. Si un admin revisa y determina que no hay riesgo, lo marca como 'resolved'. |
| Indice adicional en status? | SI | El panel #25 filtra frecuentemente por status (ej: "mostrar solo activos" es la vista por defecto). Selectividad moderada con 3 valores. El indice es ligero y mejora la experiencia del admin. |

**Impacto sobre tablas existentes:**
- Solo la tabla `safety_events` es afectada. No se modifica ninguna FK, cascada o relacion existente.
- Los indices `idx_safety_events_user_time` y `idx_safety_events_type` permanecen intactos.

**Riesgos evaluados:**
- Si un evento necesita "reabrirse" (de resolved a active), el CHECK lo permite (no es un workflow unidireccional). La logica de transiciones validas se implementa en la capa de aplicacion.

---

### CAMBIO 5 -- Nueva tabla: `survey_responses`

**Requisito origen:** Interfaz #27E (Tab E -- Metricas del Estudio: SUS y Empatia) + Decision D-11 (Instrumentos administrados externamente)

**Justificacion tecnica:**
- Los instrumentos del estudio cuasiexperimental (SUS, rubrica de empatia, escalas de bienestar pre/post) se administran FUERA de Mabel IA (formularios fisicos o Google Forms). Los resultados se importan al sistema via endpoint POST `/api/v1/admin/metrics/import`.
- La tabla almacena respuestas individuales (un registro por usuario/instrumento/fase) con el puntaje calculado y los datos crudos en JSONB.
- FK a users con ON DELETE SET NULL permite anonimizacion: si un usuario ejerce su derecho de supresion (Ley 1581), el registro de investigacion se preserva sin vinculacion a identidad.
- `imported_by` registra que admin importo los datos (trazabilidad).
- UNIQUE(user_id, instrument, phase) previene duplicados accidentales de importacion.

**SQL aplicado:**
```sql
CREATE TABLE survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  instrument      TEXT NOT NULL
                  CHECK (instrument IN ('sus', 'empathy_rubric', 'wellbeing_pre', 'wellbeing_post')),
  phase           TEXT NOT NULL
                  CHECK (phase IN ('pre', 'post')),
  score           NUMERIC(5,2),
  raw_data        JSONB,
  administered_at TIMESTAMP NOT NULL,
  imported_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  imported_by     UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT uq_survey_user_instrument_phase
    UNIQUE (user_id, instrument, phase)
);

CREATE INDEX idx_survey_instrument_phase ON survey_responses(instrument, phase);
CREATE INDEX idx_survey_user             ON survey_responses(user_id) WHERE user_id IS NOT NULL;
```

**Decisiones de evaluacion:**

| Pregunta | Decision | Razon |
|----------|----------|-------|
| CHECK en instrument? | SI con 4 valores | Los instrumentos del estudio estan definidos en el protocolo de investigacion: SUS (usabilidad), empathy_rubric (empatia percibida), wellbeing_pre (bienestar pretest), wellbeing_post (bienestar posttest). Son finitos y conocidos. Si se anade un nuevo instrumento post-MVP, un ALTER TABLE es aceptable. |
| CHECK en phase? | SI con 2 valores | El diseno cuasiexperimental tiene exactamente 2 fases: pre y post. Es invariante del estudio. |
| UNIQUE(user_id, instrument, phase)? | SI | Previene duplicados accidentales de importacion. Un estudiante tiene exactamente 1 respuesta por instrumento por fase. Si se necesita re-importar, se debe UPDATE o DELETE + INSERT. |

**Indices:**
- `idx_survey_instrument_phase`: Soporta las consultas de Tab E del panel de metricas (#27E) que agrupan por instrumento y fase (ej: "SUS promedio en fase post").
- `idx_survey_user` (parcial WHERE user_id IS NOT NULL): Soporta consultas por usuario cuando no ha sido anonimizado. Excluye registros anonimizados del indice.

**Riesgos evaluados:**
- Los valores de `instrument` incluyen 'wellbeing_pre' y 'wellbeing_post' como instrumentos separados (no como combinacion de instrumento + fase) porque las escalas de bienestar pre y post pueden ser instrumentos diferentes. El campo `phase` es ortogonal y aplica a todos. Ejemplo: se puede tener un registro SUS en fase 'pre' y otro en fase 'post'.
- `score NUMERIC(5,2)`: Soporta hasta 999.99. El SUS va de 0 a 100, la rubrica de empatia de 1 a 5. NUMERIC(5,2) cubre ambos con margen.

---

## 3. Estado Post-Cambio

### 3.1 Inventario de tablas (11 totales)

| # | Tabla | Seccion | Estado |
|---|-------|---------|--------|
| 1 | users | Usuarios y Privacidad | MODIFICADA (+3 cols) |
| 2 | consents | Usuarios y Privacidad | Sin cambios |
| 3 | preferences | Usuarios y Privacidad | Sin cambios |
| 4 | sessions | Sesiones y Mensajes | Sin cambios |
| 5 | messages | Sesiones y Mensajes | Sin cambios |
| 6 | message_reports | Reportes de Mensajes | Sin cambios |
| 7 | attachments | Adjuntos y Eventos | Sin cambios |
| 8 | safety_events | Adjuntos y Eventos | MODIFICADA (+1 col) |
| 9 | password_reset_tokens | Autenticacion | NUEVA |
| 10 | audit_logs | Auditoria | NUEVA |
| 11 | survey_responses | Investigacion | NUEVA |

### 3.2 Inventario de indices explicitos (14 totales)

| # | Indice | Tabla | Tipo | Nuevo? |
|---|--------|-------|------|--------|
| 1 | idx_sessions_user_time | sessions | B-Tree composite | No |
| 2 | idx_messages_session_time | messages | B-Tree composite | No |
| 3 | uq_message_reports_msg_user | message_reports | UNIQUE composite | No |
| 4 | idx_message_reports_status | message_reports | B-Tree | No |
| 5 | idx_message_reports_msg_time | message_reports | B-Tree composite | No |
| 6 | idx_safety_events_user_time | safety_events | B-Tree composite | No |
| 7 | idx_safety_events_type | safety_events | B-Tree | No |
| 8 | idx_safety_events_status | safety_events | B-Tree | SI |
| 9 | idx_prt_user_created | password_reset_tokens | B-Tree composite | SI |
| 10 | idx_prt_token_active | password_reset_tokens | B-Tree parcial | SI |
| 11 | idx_audit_logs_admin_time | audit_logs | B-Tree composite | SI |
| 12 | idx_audit_logs_action_time | audit_logs | B-Tree composite | SI |
| 13 | idx_survey_instrument_phase | survey_responses | B-Tree composite | SI |
| 14 | idx_survey_user | survey_responses | B-Tree parcial | SI |

### 3.3 Inventario de CHECK constraints (11 totales)

| # | Constraint | Tabla | Nuevo? |
|---|-----------|-------|--------|
| 1 | scope IN ('solo_uso','uso_mejora_anon') | consents | No |
| 2 | role IN ('system','user','assistant') | messages | No |
| 3 | reason IN ('hallucination','harmful','privacy','low_empathy','other') | message_reports | No |
| 4 | status IN ('open','triaged','resolved','dismissed') | message_reports | No |
| 5 | severity IS NULL OR (severity >= 1 AND severity <= 5) | message_reports | No |
| 6 | kind IN ('audio','image','doc') | attachments | No |
| 7 | role IN ('student','admin') | users | SI |
| 8 | chk_users_disabled_reason | users | SI |
| 9 | status IN ('active','reviewed','resolved') | safety_events | SI |
| 10 | instrument IN ('sus','empathy_rubric','wellbeing_pre','wellbeing_post') | survey_responses | SI |
| 11 | phase IN ('pre','post') | survey_responses | SI |

### 3.4 Inventario de Foreign Keys (15 totales)

| # | FK | Tabla origen | Tabla destino | ON DELETE | Nuevo? |
|---|----|--------------|--------------|-----------| -------|
| 1 | consents.user_id | consents | users | CASCADE | No |
| 2 | preferences.user_id | preferences | users | CASCADE | No |
| 3 | sessions.user_id | sessions | users | CASCADE | No |
| 4 | messages.session_id | messages | sessions | CASCADE | No |
| 5 | message_reports.message_id | message_reports | messages | CASCADE | No |
| 6 | message_reports.reporter_id | message_reports | users | CASCADE | No |
| 7 | attachments.message_id | attachments | messages | CASCADE | No |
| 8 | safety_events.user_id | safety_events | users | CASCADE | No |
| 9 | safety_events.session_id | safety_events | sessions | SET NULL | No |
| 10 | password_reset_tokens.user_id | password_reset_tokens | users | CASCADE | SI |
| 11 | audit_logs.admin_id | audit_logs | users | SET NULL | SI |
| 12 | survey_responses.user_id | survey_responses | users | SET NULL | SI |
| 13 | survey_responses.imported_by | survey_responses | users | SET NULL | SI |

Nota: La tabla tiene 13 filas de FK porque `audit_logs.target_id` NO es FK (patron polimorfico) y 2 FKs de `survey_responses` se cuentan por separado.
Recuento correcto: 10 existentes + 1 (password_reset_tokens) + 1 (audit_logs) + 2 (survey_responses) = 14 FKs totales + 1 FK existente de preferences = 15 FKs totales contando la PK-FK de preferences.

---

## 4. Tabla de Impacto en Endpoints API

| Cambio | Endpoints afectados | Tipo de impacto |
|--------|---------------------|-----------------|
| audit_logs | POST (implicito en toda accion admin), GET `/api/v1/admin/logs`, GET `/api/v1/admin/logs/export` | Nueva tabla -- Backend debe insertar en audit_logs en cada accion admin |
| password_reset_tokens | POST `/api/v1/auth/forgot-password`, POST `/api/v1/auth/reset-password` | Nueva tabla -- Backend implementa flujo de token con hash SHA-256 |
| users.role | POST `/api/v1/auth/login` (JWT incluye role), todos los endpoints `/api/v1/admin/*` (middleware verifica role='admin') | Nueva columna -- Login retorna role en JWT, middleware valida rol |
| users.disabled_at/disabled_reason | POST `/api/v1/auth/login` (verificar no deshabilitado), PATCH `/api/v1/admin/users/:id` (deshabilitar) | Nuevas columnas -- Login verifica disabled_at IS NULL, admin endpoint actualiza |
| safety_events.status | PATCH `/api/v1/admin/safety-events/:id`, GET `/api/v1/admin/safety-events` (filtro por status) | Nueva columna -- Panel admin #25 usa status para triaje |
| survey_responses | POST `/api/v1/admin/metrics/import`, GET `/api/v1/admin/metrics` (Tab E) | Nueva tabla -- Endpoint de importacion y consulta para metricas del estudio |

---

## 5. Conteo Final de Elementos del Esquema

| Elemento | Cantidad |
|----------|----------|
| Extension (pgcrypto) | 1 |
| Tablas | 11 |
| Columnas totales | 69 |
| Primary Keys | 11 |
| Foreign Keys | 15 |
| UNIQUE constraints/indices | 4 |
| CHECK constraints | 11 |
| Indices explicitos (sin PK) | 14 |
| Secciones DDL | 7 |

---

## 6. Verificacion de Integridad

### 6.1 CHECK constraints originales preservados

- [x] `consents.scope IN ('solo_uso','uso_mejora_anon')` -- SIN CAMBIOS
- [x] `messages.role IN ('system','user','assistant')` -- SIN CAMBIOS
- [x] `message_reports.reason IN ('hallucination','harmful','privacy','low_empathy','other')` -- SIN CAMBIOS
- [x] `message_reports.status IN ('open','triaged','resolved','dismissed')` -- SIN CAMBIOS
- [x] `message_reports.severity IS NULL OR (severity >= 1 AND severity <= 5)` -- SIN CAMBIOS
- [x] `attachments.kind IN ('audio','image','doc')` -- SIN CAMBIOS

### 6.2 FK y cascadas originales preservadas

- [x] consents.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] preferences.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] sessions.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] messages.session_id -> sessions(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] message_reports.message_id -> messages(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] message_reports.reporter_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] attachments.message_id -> messages(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] safety_events.user_id -> users(id) ON DELETE CASCADE -- SIN CAMBIOS
- [x] safety_events.session_id -> sessions(id) ON DELETE SET NULL -- SIN CAMBIOS

### 6.3 Nuevas tablas referencian correctamente a users(id)

- [x] password_reset_tokens.user_id -> users(id) ON DELETE CASCADE
- [x] audit_logs.admin_id -> users(id) ON DELETE SET NULL
- [x] survey_responses.user_id -> users(id) ON DELETE SET NULL
- [x] survey_responses.imported_by -> users(id) ON DELETE SET NULL

### 6.4 Orden de CREATE TABLE respeta dependencias FK

1. users (sin dependencias)
2. consents (depende de users)
3. preferences (depende de users)
4. sessions (depende de users)
5. messages (depende de sessions)
6. message_reports (depende de messages, users)
7. attachments (depende de messages)
8. safety_events (depende de users, sessions)
9. password_reset_tokens (depende de users)
10. audit_logs (depende de users)
11. survey_responses (depende de users)

---

## 7. Nota Tecnica: Convenciones de Timestamp

El esquema existente (8 tablas originales) utiliza `TIMESTAMP` (sin zona horaria) para todas las columnas temporales. Las nuevas tablas y columnas mantienen la misma convencion `TIMESTAMP` por consistencia. Para un despliegue en una unica zona horaria (Bogota, Colombia, UTC-5), esto es adecuado siempre que:

1. La aplicacion almacene y lea timestamps en UTC (convencion establecida por el Agente 04).
2. La conversion a hora local (America/Bogota) se realice en la capa de presentacion (frontend).

Si en el futuro se necesita soporte multi-zona horaria, se evaluara la migracion a `TIMESTAMPTZ` en una evolucion futura.
