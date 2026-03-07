# Revision del Esquema de Base de Datos -- Mabel IA (MVP)

> Revision realizada por: Agente 03 -- Database Engineer
> Fecha: 2026-02-18
> Esquema evaluado: Script DDL PostgreSQL 16 (unico motor) de la tesis "Implementacion en la Nube de una IA con Tecnologia NLP, Entrenada Internamente para el apoyo de Salud Mental Estudiantil en la UMB"
> Documentacion consultada (Context7): PostgreSQL 16 (/websites/postgresql_16), SQLAlchemy 2.0 (/websites/sqlalchemy_en_20)

---

## Veredicto General

El esquema de 8 tablas propuesto en la tesis es **solido y bien disenado para el MVP**. Cubre las funcionalidades principales de autenticacion, consentimiento, chat con check-in, guardrails de seguridad, reportes de mensajes, adjuntos y eventos de seguridad. Las relaciones entre tablas son correctas, los ON DELETE CASCADE/SET NULL estan bien aplicados, y los indices cubren las queries mas frecuentes. El uso de UUIDs como PK (via pgcrypto) y JSONB para campos flexibles es adecuado. PostgreSQL 16 es el unico motor de base de datos del proyecto.

Sin embargo, se identificaron **4 ajustes menores pero necesarios** que, de no aplicarse, generarian problemas reales en el MVP: (1) falta un CHECK constraint en `reason` de `message_reports` que permitiria valores arbitrarios corrompiendo la clasificacion de reportes del estudio, (2) falta un CHECK constraint en `severity` de `message_reports` que permitiria valores fuera del rango 1-5 invalidando las metricas, (3) falta un CHECK constraint en `scope` de `consents` que permitiria valores de alcance de consentimiento no definidos legalmente, y (4) falta un indice en `preferences(user_id)` que ya esta cubierto por el PK (no es necesario, es una observacion, no un cambio).

El esquema **NO requiere reestructuracion**. Las 4 modificaciones propuestas son adiciones de constraints a columnas existentes, sin cambios en tablas, relaciones ni indices.

---

## Fortalezas del Esquema Actual

1. **Normalizacion correcta (3NF):** Las 8 tablas estan bien normalizadas. No hay dependencias transitivas ni repeticion de datos. Cada entidad tiene una tabla clara: usuarios, consentimientos, preferencias, sesiones, mensajes, reportes, adjuntos y eventos de seguridad.

2. **UUIDs como PKs:** Correcto para un sistema que eventualmente migrara a Railway. Los UUIDs (generados via `gen_random_uuid()` de pgcrypto) evitan colisiones en entornos distribuidos y no revelan informacion secuencial sobre los datos.

3. **JSONB para campos semi-estructurados:** Los campos `meta`, `safety_flags`, `accessibility`, `checkin_payload` y `payload` usan JSONB nativo de PostgreSQL, lo que permite flexibilidad sin necesidad de migraciones al cambiar de modelo LLM (`{"model":"gemini-2.0"}` a `{"model":"local-3b-lora-v1"}`) o al agregar nuevas propiedades al check-in.

4. **ON DELETE CASCADE correcto en toda la cadena:** La cadena `users -> sessions -> messages -> message_reports/attachments` y `users -> consents`, `users -> preferences` usan CASCADE correctamente, garantizando borrado real (hard delete) para cumplir con la Ley 1581/2012 (derecho de supresion). La tabla `safety_events` usa `ON DELETE SET NULL` en `session_id` y `CASCADE` en `user_id`, lo que preserva el registro del evento incluso si la sesion se elimina pero lo borra si el usuario se elimina -- correcto para el requisito de supresion total.

5. **Indices bien seleccionados:** `idx_sessions_user_time`, `idx_messages_session_time`, `idx_safety_events_user_time`, `idx_safety_events_type`, `idx_message_reports_status`, `idx_message_reports_msg_time` y el indice unico `uq_message_reports_msg_user` cubren las queries del MVP: listar sesiones de un usuario, listar mensajes de una sesion, buscar eventos de seguridad, filtrar reportes por estado, y garantizar unicidad de reporte por (mensaje, usuario).

6. **Separacion limpia preferences como tabla 1:1 con user_id PK:** El patron de usar `user_id` como PK de `preferences` garantiza exactamente un registro de preferencias por usuario y simplifica el JOIN, evitando una tabla con FK separada que requeriria un UNIQUE constraint adicional.

7. **Snapshot de check-in en sesion:** El campo `checkin_opt_in` en `sessions` es un snapshot del `preferences.checkin_enabled` al momento de crear la sesion, evitando que un cambio posterior de preferencia afecte sesiones ya creadas. Patron de snapshot bien aplicado.

8. **content_sha256 para integridad:** Permite verificar que el contenido de un mensaje no fue alterado despues de persistirlo, un requisito de trazabilidad para el estudio cuasiexperimental.

---

## Hallazgos por Eje de Analisis

### 1. Completitud Funcional
**Estado:** Completo

El esquema de 8 tablas cubre todas las funcionalidades del MVP:

| Funcionalidad MVP | Tabla(s) que la soportan | Cubierta |
|---|---|---|
| Registro email/contrasena (HU-01) | `users` (email, hashed_password, display_name) | Si |
| Login JWT (HU-02) | `users` (email, hashed_password); JWT es stateless, no requiere tabla | Si |
| Consentimiento versionado (HU-03) | `consents` (version, scope, accepted_at) | Si |
| Historial ON/OFF (HU-04, HU-11) | `preferences.save_history` | Si |
| Sesion de chat (HU-05) | `sessions` (started_at, ended_at, topic_hint, meta) | Si |
| Check-in emocional (HU-06, HU-10) | `sessions.checkin_opt_in`, `checkin_payload`, `checkin_completed_at`; `preferences.checkin_enabled` | Si |
| Voz ASR/TTS (HU-07) | `attachments` (kind='audio') para audio; `preferences.tts_voice` para voz TTS | Si |
| Derivacion SOS (HU-08) | `safety_events` (event_type='risk_detected', 'redirect_shown'); `messages.safety_flags` | Si |
| Subtitulos y accesibilidad (HU-09) | `preferences.accessibility` (JSONB: subtitles, contrast, font) | Si |
| Ver historial sesiones (HU-12) | `sessions` + `messages` (query por user_id, started_at) | Si |
| Borrar conversacion (HU-13) | `sessions` ON DELETE CASCADE -> messages -> reports/attachments | Si |
| Reportar mensaje (HU-14, HU-15) | `message_reports` (reason, details, status, severity) | Si |
| Evitar reporte duplicado (HU-16) | `uq_message_reports_msg_user` UNIQUE index en (message_id, reporter_id) | Si |
| Confirmacion de reporte (HU-17) | `message_reports` + `safety_events` (event_type='user_report') | Si |
| Metadatos de mensaje (content_sha256, modelo, tokens) | `messages` (content_sha256, meta, tokens_prompt, tokens_completion) | Si |
| Guardrails safety_flags | `messages.safety_flags` (JSONB: risk_detected, keywords, severity) | Si |

**Casos de uso cubiertos:** Los 5 casos de uso de la tesis (Autenticacion y Onboarding, Chat Texto/Voz + Check-in + Guardrails, Preferencias y Accesibilidad, Historial y Privacidad, Reporte de Mensajes) estan completamente soportados por el esquema.

**Campos que no sobran:** Todos los campos de todas las tablas tienen un uso claro en el MVP. No se identificaron campos sobrantes.

**Campos que NO faltan para el MVP:** No se identificaron tablas o columnas faltantes para las funcionalidades del MVP. La tabla `users` no necesita campos de roles (solo hay un rol: estudiante), ni campos de verificacion de email (el MVP opera en entorno local controlado con 30 participantes).

### 2. Integridad y Constraints
**Estado:** Ajustes menores necesarios

**Lo que esta bien:**
- CHECK en `messages.role` IN ('system','user','assistant') -- correcto.
- CHECK en `message_reports.status` IN ('open','triaged','resolved','dismissed') -- correcto.
- CHECK en `attachments.kind` IN ('audio','image','doc') -- correcto.
- UNIQUE index `uq_message_reports_msg_user` en (message_id, reporter_id) -- correcto para HU-16.
- NOT NULL en todos los campos obligatorios -- correcto.
- DEFAULT valores apropiados (CURRENT_TIMESTAMP, FALSE para save_history, TRUE para checkin_enabled, 'open' para status, 'es' para ui_language) -- correcto.

**Lo que falta (3 constraints):**

**(a) CHECK en `message_reports.reason`:** El comentario del DDL dice `-- 'hallucination'|'harmful'|'privacy'|'low_empathy'|'other'`, pero NO hay un CHECK constraint que lo enforce. Esto significa que la BD acepta cualquier valor de texto en `reason`, como cadenas vacias, typos (`"halucination"`), o valores no previstos. En el contexto del estudio cuasiexperimental, los reportes de mensajes se analizaran como datos de investigacion (Marco metodologico, Fase 2); valores invalidos en `reason` corromperian la clasificacion y el analisis de calidad del LLM. Ademas, el frontend presenta una lista fija de motivos (HU-15: "Lista de motivos"), lo que confirma que el dominio es cerrado y debe reforzarse a nivel de BD.

**(b) CHECK en `message_reports.severity`:** El comentario dice `-- 1..5 (opcional)`, pero NO hay un CHECK constraint. La columna acepta cualquier entero (incluyendo 0, negativos, o 999). Para el estudio cuasiexperimental, severity es una metrica ordinal que se reportara en los analisis; valores fuera del rango 1-5 invalidarian las estadisticas descriptivas y las comparaciones.

**(c) CHECK en `consents.scope`:** El comentario dice `-- "solo_uso" | "uso_mejora_anon"`, pero NO hay un CHECK constraint. El scope del consentimiento esta directamente vinculado a la Ley 1581/2012, que exige "finalidades claras" del tratamiento de datos. Un scope invalido significaria que el sistema registra un consentimiento con una finalidad no definida legalmente, lo cual podria constituir un incumplimiento normativo. El Agente 12 (Ethics) valida que el flujo de consentimiento cumpla con la ley; un CHECK constraint aqui garantiza que la BD no acepte scopes fuera de los legalmente definidos.

**Soft-delete vs hard-delete:** El esquema maneja correctamente ambos patrones. `users.deleted_at` soporta soft-delete (marcar como eliminado sin borrar datos, util para desactivar cuentas preservando datos para el estudio si hay consentimiento). Para hard-delete real (supresion total bajo Ley 1581), se ejecuta `DELETE FROM users WHERE id = ?` que dispara CASCADE en toda la cadena. Ambos caminos son validos y se seleccionan a nivel de aplicacion.

### 3. Indices y Rendimiento
**Estado:** Completo

**Indices existentes y su justificacion:**

| Indice | Query que optimiza | Adecuado |
|---|---|---|
| `idx_sessions_user_time` (user_id, started_at) | Listar sesiones de un usuario ordenadas por fecha (HU-12) | Si |
| `idx_messages_session_time` (session_id, created_at) | Listar mensajes de una sesion ordenados cronologicamente (flujo de chat) | Si |
| `idx_safety_events_user_time` (user_id, created_at) | Buscar eventos de seguridad de un usuario por fecha (analisis del estudio) | Si |
| `idx_safety_events_type` (event_type) | Filtrar eventos por tipo (risk_detected, redirect_shown, user_report) | Si |
| `idx_message_reports_status` (status) | Filtrar reportes por estado (triaje: open -> triaged -> resolved) | Si |
| `idx_message_reports_msg_time` (message_id, created_at) | Buscar reportes de un mensaje ordenados por fecha | Si |
| `uq_message_reports_msg_user` (message_id, reporter_id) | Unicidad de reporte por (mensaje, usuario) + sirve como indice para la query "ya reportado?" (HU-16) | Si |

**Indice en `preferences(user_id):`** No es necesario crear un indice separado porque `user_id` es el PRIMARY KEY de la tabla `preferences`, y los PKs ya tienen un indice implicito. La query `SELECT * FROM preferences WHERE user_id = ?` usara el indice del PK automaticamente.

**Indice en `consents(user_id):`** No se creo un indice explicito en `consents.user_id`. Esto podria parecer una omision, pero en el MVP con 30 participantes, la tabla `consents` tendra como maximo ~60 registros (1-2 consentimientos por usuario). Un full table scan en 60 registros es instantaneo. El indice no es necesario para el MVP; si la base de usuarios crece post-MVP, se puede agregar via Alembic sin impacto.

**Indices GIN para JSONB (comentados):** Los indices `idx_messages_meta_gin` e `idx_messages_safety_gin` estan correctamente comentados. Para el MVP con 30 usuarios y sesiones de 15-20 minutos, la tabla `messages` tendra ~3,000-10,000 registros. A este volumen, un scan secuencial sobre columnas JSONB es rapido y un indice GIN no aporta beneficio medible. Ademas, los indices GIN tienen overhead significativo en escrituras, y el flujo de chat escribe mensajes frecuentemente. Recomendacion: **mantener comentados para el MVP**, habilitar post-MVP si el volumen supera ~100,000 mensajes o si se implementan queries que filtren por contenido JSONB (ej: `WHERE safety_flags @> '{"risk_detected":true}'`).

**Analisis del flujo critico de latencia:** El flujo de un turno de chat involucra: (1) recibir mensaje, (2) consultar historial reciente para contexto del prompt, (3) enviar a Gemini, (4) recibir respuesta streaming, (5) aplicar postfiltro, (6) guardar mensajes. Los pasos 2 y 6 son los que tocan la BD:

- Paso 2 (consultar historial): `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT N` -- cubierto por `idx_messages_session_time`. Latencia estimada: <1ms.
- Paso 6 (guardar mensajes): INSERT en `messages` -- una sola insercion. Latencia estimada: <1ms.
- El cuello de botella de latencia esta en el paso 3-4 (Gemini API), no en la BD. El esquema no es un factor limitante para el objetivo de latencia <= 20s.

### 4. Privacidad y Cumplimiento Legal
**Estado:** Completo (con la adicion del CHECK en consents.scope propuesta en Modificacion 3)

**save_history=OFF:** La politica esta definida a nivel de aplicacion, no de BD, lo cual es correcto. Cuando `preferences.save_history = FALSE`, el backend (Agente 04) no debe ejecutar INSERT en `messages` para esa sesion (o debe insertar mensajes efimeros que se eliminan al cerrar la sesion). Esto no requiere logica de BD (triggers, RLS, etc.); es una decision de la capa Service. El esquema lo soporta correctamente: la tabla `messages` no tiene un trigger que fuerce la insercion, por lo que la aplicacion puede simplemente no insertar. El `sessions` registro si se crea (para registrar metadata y check-in), pero los mensajes no se persisten.

**No PII en content:** El campo `messages.content` tiene el comentario `-- evita PII`, pero esto es una politica de aplicacion, no un constraint de BD. No es posible ni deseable implementar una regex de PII a nivel de CHECK constraint de BD (seria fragil, lento, y con falsos positivos). La validacion de no-PII se realiza en los guardrails (prefiltro/postfiltro del Agente 08) y en el system prompt de Gemini. El esquema es neutral respecto a PII, lo cual es correcto.

**Anonimizacion para el estudio:** El esquema facilita la anonimizacion. Los datos del estudio (check-ins, safety_events, message_reports) se pueden exportar sin el campo `users.email` ni `users.hashed_password`, usando solo los UUIDs como identificadores anonimos. Las queries de anonimizacion serian:

```sql
SELECT s.id, s.started_at, s.checkin_payload, s.checkin_completed_at
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE u.deleted_at IS NULL;
-- Sin incluir u.email ni u.display_name
```

Esto es factible sin cambios al esquema.

**ON DELETE CASCADE y Ley 1581/2012 (derecho de supresion):** La cadena completa de borrado es:

```
DELETE FROM users WHERE id = ?
  -> CASCADE: consents (todos los consentimientos del usuario)
  -> CASCADE: preferences (configuracion del usuario)
  -> CASCADE: sessions (todas las sesiones)
     -> CASCADE: messages (todos los mensajes de todas las sesiones)
        -> CASCADE: message_reports (todos los reportes sobre esos mensajes)
        -> CASCADE: attachments (todos los adjuntos de esos mensajes)
  -> CASCADE: safety_events (todos los eventos de seguridad del usuario)
```

Esto garantiza borrado completo y real, cumpliendo el derecho de supresion del titular (Art. 8, Ley 1581/2012). No quedan registros huerfanos.

**Consentimiento versionado (Ley 1581/2012 + Decreto 1377/2013):** La tabla `consents` permite multiples registros por usuario (diferentes versiones), registra `accepted_at` con timestamp, y tiene `version` y `scope`. Esto cumple con el requisito de consentimiento expreso, informado y versionado. La adicion del CHECK en `scope` (Modificacion 3) reforzaria la garantia de que solo se registren alcances legalmente definidos.

### 5. Escalabilidad y Preparacion Futura
**Estado:** Completo

**Escalabilidad para mas usuarios/sesiones/mensajes:** El esquema escala correctamente. Los indices compuestos (user_id + started_at, session_id + created_at) mantienen el rendimiento O(log n) para las queries principales. PostgreSQL maneja millones de registros en estas tablas sin problemas. Para el MVP con 30 usuarios, la escalabilidad no es una preocupacion.

**Campo meta JSONB para cambio de modelo LLM:** El campo `messages.meta` (JSONB) esta preparado para almacenar `{"model":"gemini-2.0-flash", "temperature":0.7}` en el MVP y `{"model":"local-3b-lora-v1", "temperature":0.3, "quantization":"4bit"}` en post-MVP. El cambio de contenido del JSONB no requiere migracion de esquema. Confirmado por el TECHSTACK.md: "el campo meta en messages ya soporta {"model": "local-3b-lora-v1"} sin migracion".

**Integracion futura de SER (speechbrain):** El esquema esta preparado. Los datos de emocion detectada por voz pueden almacenarse en:
- `messages.safety_flags` (JSONB): agregar `{"emotion":"anxious", "confidence":0.85}` al JSONB existente.
- `messages.meta` (JSONB): agregar metadatos del modelo SER.
- `safety_events.payload` (JSONB): registrar detecciones de emocion como eventos.
Ninguno de estos cambios requiere ALTER TABLE.

**Roles adicionales mas alla de 'system','user','assistant':** El CHECK constraint actual `(role IN ('system','user','assistant'))` es restrictivo por diseno y es lo correcto para el MVP. Si en el futuro se necesitan roles como 'tool' (para function calling) o 'function', se puede actualizar el CHECK via Alembic:

```sql
ALTER TABLE messages DROP CONSTRAINT messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check CHECK (role IN ('system','user','assistant','tool'));
```

Esto es una migracion trivial que no requiere cambios estructurales.

**Metricas longitudinales de bienestar:** El esquema soporta tendencias de bienestar por estudiante a lo largo del tiempo mediante la combinacion de `sessions.checkin_payload` (mood 0-10, sleep, focus) y `sessions.started_at`. La query:

```sql
SELECT s.started_at, s.checkin_payload->>'mood' AS mood
FROM sessions s
WHERE s.user_id = ? AND s.checkin_completed_at IS NOT NULL
ORDER BY s.started_at;
```

produce una serie temporal de bienestar. No se necesitan tablas adicionales.

### 6. Compatibilidad PostgreSQL <-> SQLite
**Estado:** N/A — Motor unico

> **Seccion obsoleta.** A partir de 2026-02-18, SQLite fue eliminado del proyecto por decision del Product Owner. PostgreSQL 16 es el unico motor de base de datos tanto para desarrollo como para produccion. La justificacion incluye: dev/prod parity (principio 12-factor), eliminacion de complejidad de compatibilidad dual, Docker Compose para desarrollo local, migracion directa a Railway, y simplificacion para un equipo de 3 estudiantes. Ver TECHSTACK.md Revision 2.

### 7. Alineacion con Tech Stack
**Estado:** Completo

**SQLAlchemy 2.0 como ORM (conectando exclusivamente a PostgreSQL 16):**
- Los tipos de columna (UUID, TEXT, BOOLEAN, TIMESTAMP, JSONB, INT) se mapean limpiamente a tipos SQLAlchemy 2.0 (`Uuid`, `String`, `Boolean`, `DateTime`, `JSON`, `Integer`).
- Se usa `server_default=text('gen_random_uuid()')` directamente en los modelos, sin abstracciones de compatibilidad.
- Los CHECK constraints se definen en SQLAlchemy via `CheckConstraint` en `__table_args__` o directamente en `mapped_column`.
- Las FK con CASCADE/SET NULL se mapean con `ForeignKey("table.col", ondelete="CASCADE")`.
- Los indices se crean con `Index` en `__table_args__`.
- El patron 1:1 de `preferences` (PK = FK) se mapea con `relationship(uselist=False)`.

**Pydantic v2 para validacion de payloads JSONB:**
- Los campos JSONB (`checkin_payload`, `safety_flags`, `meta`, `accessibility`, `payload`) se validan con modelos Pydantic v2 antes de persistir:
  ```python
  class CheckinPayload(BaseModel):
      mood: int = Field(ge=0, le=10)
      sleep: str | None = None
      focus: str | None = None
      note: str | None = None
  ```
- Pydantic v2 serializa a dict, que SQLAlchemy persiste como JSONB. Compatibilidad completa.

**Alembic para migraciones incrementales:**
- El esquema de 8 tablas se puede generar como la migracion inicial (`alembic revision --autogenerate -m "initial schema"`).
- Los CHECK constraints adicionales propuestos (Modificaciones 1-3) se implementarian como una segunda migracion.
- Alembic detecta cambios en modelos SQLAlchemy y genera scripts de migracion automaticamente. Los constraints CHECK requieren configuracion explicita en `env.py` para autogeneracion (`compare_type=True`, `compare_server_default=True`).
- El esquema no tiene elementos que dificulten las migraciones (no hay herencia de tablas, no hay tipos custom complejos, no hay procedimientos almacenados).

---

## Modificaciones Propuestas

Se proponen 3 modificaciones, todas consistentes con el principio de **cambio minimo viable**: se agregan CHECK constraints a columnas existentes, sin modificar tablas, relaciones, indices ni estructura alguna.

### Modificacion 1: CHECK constraint en message_reports.reason

- **Requisito origen:** HU-15 ("Lista de motivos" fija), Caso de Uso "Reporte de Mensajes" (motivos definidos: hallucination|harmful|privacy|low_empathy|other), Marco Metodologico Fase 2 (analisis de reportes como datos de investigacion).
- **Problema detectado:** El campo `reason` acepta cualquier valor TEXT, pero los motivos de reporte son un dominio cerrado de 5 valores. Sin CHECK, la BD acepta cadenas vacias, typos, o valores no previstos que corromperian la clasificacion de reportes en el analisis del estudio cuasiexperimental. El frontend presentara una lista fija (HU-15), pero la BD no enforce esa restriccion, dejando una brecha si algun cliente o test inserta datos directamente.
- **Justificacion tecnica:** El dominio de valores es cerrado (5 motivos) y definido en la tesis. Un CHECK constraint es la herramienta correcta de PostgreSQL para enforcar dominios cerrados (documentacion Context7 PostgreSQL 16: "CHECK ( expression )"). La validacion a nivel de Pydantic/aplicacion es complementaria pero no sustitutiva de la validacion a nivel de BD, que es la ultima linea de defensa contra datos invalidos.
- **Impacto:** Solo la columna `message_reports.reason`. No afecta relaciones, indices ni otras tablas.
- **SQL propuesto (PostgreSQL 16):**
```sql
ALTER TABLE message_reports
  ADD CONSTRAINT chk_message_reports_reason
  CHECK (reason IN ('hallucination','harmful','privacy','low_empathy','other'));
```
- **Riesgo:** Bajo. El INSERT fallara si se envia un reason no valido, lo cual es el comportamiento deseado. La aplicacion (Pydantic) validara antes de llegar a la BD.

### Modificacion 2: CHECK constraint en message_reports.severity

- **Requisito origen:** Esquema DDL de la tesis (comentario "1..5 (opcional)"), Marco Metodologico Fase 2 (severity como metrica ordinal para analisis estadistico de gravedad de reportes).
- **Problema detectado:** El campo `severity` acepta cualquier valor entero (incluyendo 0, negativos, 100, etc.). El comentario indica que el rango valido es 1-5, pero no hay CHECK que lo enforce. Severity es una metrica ordinal del estudio; valores fuera de rango invalidarian los descriptivos (media, mediana, DE) y las comparaciones que el Agente 13 (Research) realizara en Fase 2.
- **Justificacion tecnica:** El rango 1-5 esta definido en el propio DDL (comentario). Un CHECK constraint en PostgreSQL garantiza la integridad del rango. Dado que el campo es nullable (opcional), el CHECK permite NULL pero rechaza valores fuera de rango.
- **Impacto:** Solo la columna `message_reports.severity`. No afecta relaciones, indices ni otras tablas.
- **SQL propuesto (PostgreSQL 16):**
```sql
ALTER TABLE message_reports
  ADD CONSTRAINT chk_message_reports_severity
  CHECK (severity IS NULL OR (severity >= 1 AND severity <= 5));
```
- **Riesgo:** Bajo. El INSERT fallara si severity esta fuera de rango, lo cual es el comportamiento deseado.

### Modificacion 3: CHECK constraint en consents.scope

- **Requisito origen:** Ley 1581/2012 y Decreto 1377/2013 (consentimiento con finalidades claras), HU-03 (aceptar consentimiento informado), Agente 12 (validacion de que el flujo de consentimiento cumple la ley).
- **Problema detectado:** El campo `scope` acepta cualquier valor TEXT, pero los alcances de consentimiento son un dominio cerrado de 2 valores: 'solo_uso' (el estudiante solo autoriza el uso del servicio) y 'uso_mejora_anon' (autoriza ademas el uso anonimizado para mejora del sistema). La Ley 1581/2012, Art. 12 exige que las finalidades del tratamiento sean "expresas" y "determinadas"; un scope no definido legalmente significaria un consentimiento con finalidad indeterminada, lo cual podria constituir incumplimiento normativo.
- **Justificacion tecnica:** El dominio de valores es cerrado (2 alcances) y definido en la tesis y en el marco legal. Un CHECK constraint garantiza que la BD solo registre scopes legalmente validos.
- **Impacto:** Solo la columna `consents.scope`. No afecta relaciones, indices ni otras tablas.
- **SQL propuesto (PostgreSQL 16):**
```sql
ALTER TABLE consents
  ADD CONSTRAINT chk_consents_scope
  CHECK (scope IN ('solo_uso','uso_mejora_anon'));
```
- **Riesgo:** Bajo. Si en el futuro se agrega un tercer scope, se actualiza el CHECK via Alembic. Para el MVP los 2 alcances estan claramente definidos.

---

## Esquema DDL Actualizado

A continuacion se incluye el script DDL completo de PostgreSQL 16 (unico motor del proyecto) con las 3 modificaciones integradas. Los cambios respecto al original estan marcados con comentarios `-- [MODIFICACION N]`.

### Script PostgreSQL 16 (actualizado)

```sql
-- Requisitos: PostgreSQL 13+
-- Habilita generacion de UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- 1) USUARIOS Y PRIVACIDAD
-- =========================

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  hashed_password  TEXT NOT NULL,
  display_name     TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at       TIMESTAMP
);

CREATE TABLE consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  scope        TEXT NOT NULL
               CHECK (scope IN ('solo_uso','uso_mejora_anon')),  -- [MODIFICACION 3]
  accepted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE preferences (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  save_history    BOOLEAN NOT NULL DEFAULT FALSE,
  ui_language     TEXT NOT NULL DEFAULT 'es',
  tts_voice       TEXT,
  accessibility   JSONB,
  checkin_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- =========================
-- 2) SESIONES Y MENSAJES
-- =========================

CREATE TABLE sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at             TIMESTAMP,
  topic_hint           TEXT,
  meta                 JSONB,

  checkin_opt_in       BOOLEAN NOT NULL DEFAULT TRUE,
  checkin_payload      JSONB,
  checkin_completed_at TIMESTAMP
);

CREATE INDEX idx_sessions_user_time ON sessions(user_id, started_at);

CREATE TABLE messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content            TEXT NOT NULL,
  content_sha256     TEXT,
  meta               JSONB,
  safety_flags       JSONB,
  tokens_prompt      INT,
  tokens_completion  INT,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_session_time ON messages(session_id, created_at);
-- (Opcional - habilitar post-MVP si volumen > 100K mensajes)
-- CREATE INDEX idx_messages_meta_gin   ON messages USING GIN (meta);
-- CREATE INDEX idx_messages_safety_gin ON messages USING GIN (safety_flags);

-- =========================
-- 3) REPORTES DE MENSAJES
-- =========================

CREATE TABLE message_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL
               CHECK (reason IN ('hallucination','harmful','privacy','low_empathy','other')),  -- [MODIFICACION 1]
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','triaged','resolved','dismissed')),
  severity     INT
               CHECK (severity IS NULL OR (severity >= 1 AND severity <= 5)),  -- [MODIFICACION 2]
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP
);

CREATE UNIQUE INDEX uq_message_reports_msg_user ON message_reports(message_id, reporter_id);
CREATE INDEX idx_message_reports_status   ON message_reports(status);
CREATE INDEX idx_message_reports_msg_time ON message_reports(message_id, created_at);

-- =========================
-- 4) ADJUNTOS Y EVENTOS
-- =========================

CREATE TABLE attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('audio','image','doc')),
  path        TEXT NOT NULL,
  meta        JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE safety_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES sessions(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_safety_events_user_time ON safety_events(user_id, created_at);
CREATE INDEX idx_safety_events_type      ON safety_events(event_type);
```

---

## Resumen de Decision

| Eje | Estado | Cambios necesarios |
|-----|--------|--------------------|
| Completitud Funcional | Completo | No -- Las 8 tablas cubren las 17 HU, 5 casos de uso y todas las funcionalidades del MVP |
| Integridad y Constraints | Ajustes menores | Si -- 3 CHECK constraints faltantes: reason, severity (message_reports), scope (consents) |
| Indices y Rendimiento | Completo | No -- Los 7 indices cubren las queries del MVP; indices GIN correctamente diferidos |
| Privacidad y Cumplimiento Legal | Completo | Si -- El CHECK en consents.scope (Mod. 3) refuerza el cumplimiento de Ley 1581/2012 |
| Escalabilidad y Preparacion Futura | Completo | No -- JSONB soporta cambio de modelo LLM; esquema preparado para SER y roles adicionales |
| Compatibilidad | N/A | No -- Motor unico (PostgreSQL 16). SQLite eliminado del proyecto |
| Alineacion con Tech Stack | Completo | No -- Tipos, constraints e indices se mapean limpiamente a SQLAlchemy 2.0, Pydantic v2 y Alembic |
