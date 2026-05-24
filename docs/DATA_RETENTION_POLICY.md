# Política de retención de datos — Mabel-IA

**Fecha**: 2026-05-23
**Marco aplicable**: Ley 1581/2012 (Habeas Data Colombia) + Decreto 1377/2013, Ley 1616/2013 (salud mental), Resolución 8430/1993 (investigación con riesgo mínimo), Ley 1419/2010 (telehealth), principios UNESCO 2021 + AI Act UE (transparencia y explicabilidad).
**Auditado por**: Agente 12 — Ethics, Privacy & Compliance (2026-05-23).

---

## 1. Principios

1. **No engaño en el copy** (Ley 1581 art. 4 lit. d). Si los datos siguen en BD, no decimos "eliminar". Si se ocultan al usuario pero persisten para investigación, decimos exactamente eso.
2. **Información previa** (Decreto 1377 art. 5). Cualquier acción irreversible o asimétrica debe explicarse al usuario ANTES de pedirle confirmación.
3. **Ramificación por consentimiento** (Ley 1581 art. 8 + Decreto 1377 art. 6). El alcance del scope firmado determina si una sesión puede retenerse o debe eliminarse. Tres scopes posibles:
   - `solo_uso` — usar Mabel sin ceder datos a investigación → **no autoriza** retención para análisis.
   - `uso_mejora_anon` — permite uso anonimizado para mejorar el modelo.
   - `uso_investigacion` — todo lo anterior + análisis para tesis.
4. **Derecho de supresión efectiva** (Ley 1581 art. 8 lit. e). Independiente del scope firmado, el titular puede pedir borrado real de datos pasados sin tener que revocar consentimientos futuros.
5. **`messages.content` es dato sensible** (Ley 1581 art. 5). Toda lógica que lo manipule aplica el estándar reforzado: autorización expresa, finalidad específica.

---

## 2. Matriz de acciones del usuario

| Acción del usuario | Efecto sobre `messages` / `sessions` | Efecto sobre métricas admin | Reversible | Scope que la condiciona |
|---|---|---|---|---|
| **Toggle OFF `save_history`** (Settings) | `sessions.hidden_at = NOW()` masivo sobre TODAS sus sesiones. `hidden_reason = 'user_toggle_off'` | Sin efecto (métricas siguen contando) | **NO** para sesiones existentes; las nuevas nacen ocultas (`hidden_at` se asigna al crearlas mientras el flag esté OFF) | Solo si scope ≠ `solo_uso`. Si es `solo_uso` → **hard DELETE** real (no soft hide) |
| **Toggle ON `save_history`** | Ninguno sobre sesiones existentes (one-way intencional para no engañar). Sesiones nuevas a partir de ahora nacen visibles (`hidden_at = NULL`) | Sin efecto | NO afecta retroactivamente | Cualquiera |
| **"Quitar de mi barra lateral"** (menú 3-puntos por sesión) | `sessions.hidden_at = NOW()` solo en esa sesión. `hidden_reason = 'user_per_session'` | Sin efecto | NO desde UI (admin podría reverter via DB) | Cualquiera |
| **"Eliminar definitivamente esta conversación"** (modal con CONFIRMAR) | Hard DELETE de la sesión + CASCADE messages + safety_events.session_id → NULL | Conteos pre-existentes se conservan; nuevos cálculos excluyen | **NO** (irreversible) | Cualquiera |
| **"Eliminar TODAS mis conversaciones"** (Privacidad → "Eliminar mis datos") | Hard DELETE de TODAS las sesiones del usuario (preserva user, preferences, consents) | Conteos pre-existentes se conservan | **NO** | Cualquiera |
| **`DELETE /users/me`** (eliminar cuenta entera) | Hard DELETE CASCADE de TODO. `safety_events.user_id` queda NULL. `audit_logs.actor_id` queda NULL (preserva `details.email` como identificador anónimo del registro) | Conteos pre-existentes se conservan | **NO** | D-14: hard delete inmediato, sin periodo de gracia |

---

## 3. Audit trail

Toda acción de §2 emite una fila en `audit_logs` con `actor_role='student'`. Acciones nuevas:

- `history_toggle_off` — `details: { affected_sessions: N, scope: 'uso_mejora_anon'|'uso_investigacion', behavior: 'soft_hide'|'hard_delete' }`
- `history_toggle_on` — `details: {}`
- `session_hidden` — `details: { session_id, reason: 'user_per_session' }`
- `session_deleted_hard` — `details: { session_id, messages_deleted: N }`
- `user_messages_hard_delete` — `details: { sessions_deleted: N, messages_deleted: N }`

El usuario puede consultar su audit trail vía `GET /users/me/export` (ya implementado).

---

## 4. Ventanas de visualización ≠ política de retención

La interfaz admin muestra ventanas rolling de 30 días (`sessions_per_day_30d`, `mood_distribution_30d`, etc.). Estas son **filtros de visualización**, NO políticas de retención. La data subyacente no se borra a los 30 días — solo deja de aparecer en ese chart específico.

La mención de "cronjob 30 días" en `docs/ADMIN_PANEL.md` (sección L2) es para redaction de `message_id` en payloads de `safety_events`. **Implementado 2026-05-24** — ver §10. No aplica al borrado de cuentas ni de sesiones.

---

## 5. Soft hide vs hard delete — decisión técnica

El campo `sessions.hidden_at TIMESTAMPTZ NULL` distingue ambos casos:

- **`hidden_at IS NULL`**: visible normal. Aparece en sidebar, exportable por el usuario, contable en métricas.
- **`hidden_at IS NOT NULL`**: oculto del usuario. NO aparece en sidebar ni en `GET /sessions`. SÍ aparece en métricas admin y exports de investigación (porque la base legal es el consentimiento).

El campo `sessions.hidden_reason TEXT` distingue el origen (`user_toggle_off`, `user_per_session`, `admin_action`) para explicabilidad ante el titular si reclama.

**Hard delete** (sesiones individuales o masivas) usa `DELETE FROM sessions WHERE id = ...` con CASCADE — los messages se borran físicamente. Las métricas previamente computadas (agregaciones, counts) se conservan; recalcularlas excluiría esos datos.

---

## 6. Casos límite

### 6.1 Usuario firmó `solo_uso` y desactiva historial

El backend lee `consent.scope` del usuario antes de marcar `hidden_at`. Si scope = `solo_uso`, ejecuta `hard_delete_all_user_messages` en lugar de soft hide. Razón: el scope `solo_uso` **no autoriza** retención para análisis o investigación; retener datos contradice la base legal del consentimiento.

El modal del toggle muestra dinámicamente el comportamiento esperado: para `solo_uso` el copy dice "se eliminarán de forma definitiva" en lugar de "se ocultarán".

### 6.2 Usuario revoca consentimiento de investigación

Endpoint `PATCH /consents/current` permite cambiar el scope. Bajar de `uso_investigacion` a `solo_uso` **NO** dispara borrado retroactivo automáticamente (el flujo "Eliminar mis datos" es voluntario y explícito). La interfaz de cambio de scope informa al usuario que su data pasada permanece visible para investigación bajo el consentimiento previo, y le muestra el enlace a "Eliminar mis datos" si quiere supresión efectiva.

### 6.3 Admin elimina cuenta de usuario

Operación distinta a las del titular (no implementada hoy). Si se implementa, debe seguir el patrón D-14: hard delete CASCADE + audit_log con `actor_role='admin'` + razón obligatoria mínima 10 chars.

---

## 7. Endpoints

| Verbo | Path | Acción | Audit log action |
|---|---|---|---|
| `PUT` | `/preferences` | Toggle `save_history`. Lógica adicional en el service. | `history_toggle_off` / `history_toggle_on` |
| `PATCH` | `/sessions/{id}/hide` | Soft hide individual | `session_hidden` |
| `DELETE` | `/sessions/{id}` | Hard delete individual | `session_deleted_hard` |
| `DELETE` | `/users/me/messages` | Hard delete todas las conversaciones (preserva cuenta) | `user_messages_hard_delete` |
| `DELETE` | `/users/me` | Hard delete cuenta entera (D-14) | `user_delete` (existente) |

---

## 8. Cambios al schema (mig 012)

```sql
ALTER TABLE sessions
  ADD COLUMN hidden_at TIMESTAMPTZ NULL,
  ADD COLUMN hidden_reason TEXT NULL,
  ADD CONSTRAINT ck_sessions_hidden_reason CHECK (
    hidden_reason IS NULL
    OR hidden_reason IN ('user_toggle_off', 'user_per_session', 'admin_action')
  );

CREATE INDEX idx_sessions_user_visible
  ON sessions (user_id, started_at DESC)
  WHERE hidden_at IS NULL;
```

---

## 9. Referencias

- Ley 1581/2012 art. 4 (principios), art. 5 (datos sensibles), art. 8 (derechos del titular — incluye supresión lit. e), art. 9 (autorización revocable).
- Decreto 1377/2013 art. 5 (información previa), art. 6 (datos sensibles), art. 21 (derecho de supresión).
- Resolución 8430/1993 art. 11 (clasificación de riesgo en investigación).
- `MEMORY.md` D-14 (Hard DELETE directo MVP).
- `MEMORY.md` Evo 005b (safety_events.user_id SET NULL).
- `docs/ADMIN_PANEL.md` §10 (audit_logs catálogo), §12 (privacidad cruzada).

---

## 10. Cron de redacción L2 — `redact_old_message_ids`

**Implementación**: `backend/scripts/redact_old_message_ids.py` + `railway.cron.toml`.
**Cadencia**: diaria, 03:00 UTC (22:00 hora Bogotá — off-peak).
**Service Railway**: separado del web (`uvicorn`), mismo Dockerfile, `restartPolicyType="NEVER"`.

### Qué hace

```sql
UPDATE safety_events
SET    payload = payload - 'message_id'
WHERE  created_at < NOW() - INTERVAL '30 days'
  AND  payload ? 'message_id';
```

- **Elimina solo la clave `message_id`** del JSONB `payload`. Resto del payload (`severity`, `matched_keywords`, etc.) intacto.
- **No borra filas**: el `safety_event` sigue contando para métricas (Tab D, dashboard 24h, conteos históricos).
- **Idempotente**: cláusula `payload ? 'message_id'` evita re-tocar filas ya redactadas → re-correr el cron es no-op.
- **Sin índice dedicado**: el único índice con `created_at` (`idx_safety_events_user_time`) es compuesto y lidera con `user_id`, así que Postgres hará seq scan para esta query. Aceptable para el piloto (decenas de filas/día). Si `safety_events` crece a >100k filas tras producción, considerar `CREATE INDEX idx_safety_events_created_at ON safety_events(created_at) WHERE payload ? 'message_id'` (parcial: solo indexa lo que el cron toca).

### Por qué redactar y no borrar

Los `safety_events` son la línea base de alarma de seguridad (suicidio, autolesión, crisis). Eliminarlos rompería:

- Métricas longitudinales (`safety_events_per_day` 14d/30d en panel admin).
- Auditoría legal: si Defensoría del Pueblo pide ver el agregado de eventos de risk_detected históricos, deben existir.
- Investigación de la tesis (anonymizada — el `user_id` ya pudo quedar NULL por D-14, ver Evo 005b).

Redactar solo el `message_id` rompe la correlación con un turno específico (que el estudiante puede haber borrado) sin perder señal estadística.

### Operación manual

```bash
# Local
cd backend && source .venv/bin/activate
python -m scripts.redact_old_message_ids

# Producción (Railway shell del cron service)
python -m scripts.redact_old_message_ids
```

### Validación / smoke test

Reproducible en local con Postgres corriendo:

```python
# 1. Seed
import asyncio, asyncpg, json, uuid
async def seed():
    c = await asyncpg.connect('postgresql://USER:PASS@localhost:5432/mabel_ia')
    await c.execute("DELETE FROM safety_events WHERE event_type='test_redact'")
    for days, payload in [
        (38, {'message_id': str(uuid.uuid4()), 'severity': 'high'}),    # debe redactarse
        (45, {'message_id': str(uuid.uuid4()), 'severity': 'medium'}),  # debe redactarse
        (60, {'message_id': str(uuid.uuid4()), 'extra': 'x'}),          # debe redactarse, extra preservado
        (40, {'severity': 'high'}),                                     # ya redactado, no-op
        (5,  {'message_id': str(uuid.uuid4()), 'severity': 'high'}),    # reciente, intacto
        (15, {'message_id': str(uuid.uuid4()), 'severity': 'medium'}),  # reciente, intacto
    ]:
        await c.execute(
            f"INSERT INTO safety_events (event_type, payload, created_at) "
            f"VALUES ('test_redact', $1, NOW() - INTERVAL '{days} days')",
            json.dumps(payload),
        )
    await c.close()
asyncio.run(seed())
```

```bash
# 2. Run
cd backend && source .venv/bin/activate
python -m scripts.redact_old_message_ids
# → "[redact_message_ids] redacted message_id from 3 safety_events older than 30 days"

# 3. Re-run (idempotencia)
python -m scripts.redact_old_message_ids
# → "[redact_message_ids] redacted message_id from 0 safety_events older than 30 days"

# 4. Cleanup
psql -c "DELETE FROM safety_events WHERE event_type='test_redact';"
```

Resultado esperado: las 3 filas viejas con `message_id` quedan con payload reducido (clave `extra` se preserva), la fila vieja ya redactada queda igual, las 2 recientes con `message_id` quedan intactas.

### Cuándo cambiar `RETENTION_DAYS`

La constante está al inicio de `backend/scripts/redact_old_message_ids.py` (buscar `RETENTION_DAYS =`). Si se mueve, actualizar también — todos los puntos donde el número "30" aparece junto a "días" o "retención":

- `docs/ADMIN_PANEL.md` § 12.1 (fila L2 de la tabla de privacidad).
- `docs/DATA_RETENTION_POLICY.md`: el cuerpo de §10 y el bloque SQL al inicio de §10.
- Manual técnico y de usuario (si mencionan la ventana).

> Nota: §4 de este documento describe **ventanas de visualización de UI**, no la ventana de retención de payloads. Cambiar `RETENTION_DAYS` no obliga a editar §4.
