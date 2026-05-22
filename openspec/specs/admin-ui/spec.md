# admin-ui Specification

## Purpose
TBD - created by archiving change admin-brand-skin. Update Purpose after archive.
## Requirements
### Requirement: Admin layout con sidebar brand y header limpio

El layout del panel administrativo SHALL renderizar un sidebar de 220px sobre `var(--ink-900)` a la izquierda y un header de 64px con fondo blanco y `border-bottom: 1px solid var(--ink-200)` arriba (decisiones D-A1 + D-A2). El sidebar SHALL agrupar la navegación en tres bloques con encabezado micro-caps: Operación (Dashboard, Safety events, Reportes), Datos (Métricas, Calificación empatía, Usuarios) y Sistema (Configuración, Logs). El sidebar SHALL incluir, fijo al pie, un pill de perfil con el email enmascarado del admin (`e***@est.umb.edu.co`), su rol y un botón "Salir". El header SHALL renderizar un breadcrumb "Panel administrativo / {sección}" a la izquierda y un pill compacto "Admin · {nombre} · Salir" a la derecha. El layout SHALL eliminar cualquier uso de `bg-accent`, `text-accent` o `border-accent` en código admin (decisión D-A5).

#### Scenario: Sidebar pinta ink-900 sin depender de --color-accent

Given que el panel admin está montado y el archivo `AdminSidebar.tsx` se renderiza
When se inspecciona el `background-color` computado del `<aside>` raíz
Then SHALL resolver a `#1A1110` (valor de `var(--ink-900)`)
And el árbol del admin NO SHALL contener ninguna clase `bg-accent`, `text-accent` ni `border-accent`

#### Scenario: Header limpio sin barra roja

Given que el admin abre cualquier ruta `/admin/*`
When se renderiza el header del layout
Then el `background-color` del header SHALL ser blanco (`#FFFFFF`)
And SHALL existir un `border-bottom` de `1px solid var(--ink-200)`
And NO SHALL existir ningún bloque con `bg-primary` que ocupe el ancho completo del header

#### Scenario: Pill de perfil enmascara email

Given que el admin está autenticado con email `admin.test@est.umb.edu.co`
When se renderiza el pill de perfil del sidebar o header
Then el texto visible del email SHALL ser `a***@est.umb.edu.co`
And el email completo NO SHALL aparecer en ningún nodo del DOM del pill

---

### Requirement: Dashboard ejecutivo brand-styled

La página `/admin` SHALL renderizar un header editorial con eyebrow `Panel ejecutivo` en `mabel-600/80`, título `Dashboard` en `text-4xl font-display text-ink-900` y subtítulo en `ink-500`. SHALL mostrar siete `MetricCard` (Total usuarios, Sesiones hoy, Safety events 24h, Reportes pendientes, Latencia promedio, SUS promedio, Nuevos esta semana) en grid fluido `2 / 3 / 4 / 7` con el layout descrito en D-A4 (label top, value 3xl, hint bottom, badge delta opcional, punto threshold). SHALL renderizar a continuación cuatro `ChartCard` (Sesiones por día — últimos 30 días, Distribución de ánimo, Latencia por día con línea de referencia 20 s, Activaciones de guardrails — últimos 14 días) con paleta brand (`CHART_COLORS` migrado a `mabel-600`, `ink-700`, `success-600`, `warn-600`). SHALL finalizar con un donut de safety events por tipo (últimos 30 días) y una tabla "Últimos 5 safety events" estilo plano (D-A3). Auto-refresh cada 30 s SHALL preservarse.

#### Scenario: KPIs threshold visual

Given que el endpoint `/admin/dashboard` devuelve `latency_avg_ms: 18000` y `sus_avg: 72`
When la página `/admin` se renderiza
Then la `MetricCard` "Latencia promedio" SHALL mostrar un punto verde junto al value `18.0 s`
And la `MetricCard` "SUS promedio" SHALL mostrar un punto verde junto al value `72.0`

#### Scenario: Dashboard no muestra ningún mensaje de usuario

Given que el dashboard hace polling y obtiene `last_5_safety_events`
When se renderiza la tabla "Últimos 5 safety events"
Then las columnas SHALL ser exactamente: Fecha, Tipo, Severidad, Estado
And NO SHALL aparecer ninguna columna ni tooltip que muestre `messages.content` o texto del estudiante

---

### Requirement: Tablas operativas (patrón canónico SafetyEvents)

Toda página tabular del panel admin (SafetyEvents, Reports, Users, EmpathyRatings, AuditLogs) SHALL aplicar el patrón canónico descrito en D-A3:

- Wrapper `bg-white`, `border: 1px solid var(--ink-200)`, `border-radius: var(--r-lg)`, `overflow: hidden`, `shadow: none`.
- Filtros como pills horizontales con `border: 1px solid var(--ink-200)`, `border-radius: 9999px`, fondo `var(--white)`, estado activo `bg: var(--mabel-50)` + `border: var(--mabel-600)` + `text: var(--mabel-700)`. Filtros viven encima del wrapper, no dentro de la tabla.
- Header tabla `bg: var(--ink-50)`, `text-[10px] uppercase tracking-[0.14em] text-ink-500 font-semibold`, padding `py-2 px-4`.
- Filas con `border-bottom: 1px solid var(--ink-100)`, hover `bg: var(--ink-50)/60`, padding `py-2.5 px-4`, transición 150 ms.
- Badges semánticos con paleta brand: severidad/estado mapeados a `success-{50/600}`, `warn-{50/600}`, `danger-{50/600}`, `info-{50/600}` (chips redondos con borde `border-{semantic}-200`).
- Paginación al pie del wrapper, `border-top: 1px solid var(--ink-100)`, `bg: var(--ink-50)/40`.
- Botón "Exportar CSV" en barra de acciones del wrapper, estilo `bg: var(--ink-900) text-white hover: ink-700`. Genera siempre CSV anonimizado con ids `sha256(value)[:16]`.
- Toda mutación admin de fila (cambio de estado, marcar revisado) SHALL escribir un registro en `audit_log`.

#### Scenario: SafetyEvents renderiza patrón canónico

Given que el admin abre `/admin/safety-events` con 12 eventos en BD
When la página renderiza
Then existe exactamente un wrapper con `border: 1px solid var(--ink-200)` y `border-radius` `--r-lg`
And el header tabla usa `text-[10px]` uppercase sobre `bg: var(--ink-50)`
And cada fila con `severity: high` SHALL mostrar un chip `bg-danger-50 text-danger-700 border-danger-200`
And ninguna fila SHALL renderizar el contenido del mensaje del estudiante

#### Scenario: Export CSV anonimiza ids

Given que el admin pulsa "Exportar CSV" en `/admin/safety-events`
When se genera el archivo CSV
Then la columna `user_id` SHALL contener strings de 16 caracteres hexadecimales (sha256[:16])
And NO SHALL aparecer ningún UUID original ni email completo

#### Scenario: Cambio de estado escribe audit_log

Given que el admin marca un safety event de `open` a `triaged`
When la mutación termina con éxito
Then el backend SHALL crear un registro en `audit_logs` con `action: "safety_event.update_status"` y el `admin_user_id` del actor

---

### Requirement: UserDetail con hero band brand

La página `/admin/users/:id` SHALL renderizar una banda hero (no full-rojo) con `bg: var(--mabel-50)`, `border-bottom: 1px solid var(--ink-200)` y `padding: 24px`. Dentro mostrar: avatar circular 56px con iniciales del usuario sobre `bg: var(--mabel-100)`, email enmascarado en `text-2xl font-display text-ink-900`, role pill (`Estudiante` / `Admin` / `Investigador`) con paleta brand semántica, badge "Activo" / "Deshabilitado" y, a la derecha, botón "Deshabilitar" (variante destructive `bg: var(--danger-600) text-white hover: danger-700`) o "Reactivar" según estado. Bajo la banda hero, tabs internos: "Resumen", "Sesiones", "Safety events", "Reportes", "Auditoría". Cada tab carga datos del usuario respetando D-03 (sin `messages.content`).

#### Scenario: Email enmascarado en hero

Given que el admin abre `/admin/users/abc123` y el usuario es `juan.perez@est.umb.edu.co`
When la banda hero se renderiza
Then el título de la banda SHALL ser `j***@est.umb.edu.co`
And el email completo NO SHALL aparecer en ningún nodo de la banda

#### Scenario: Tab Sesiones no muestra contenido

Given que el admin selecciona el tab "Sesiones" en UserDetail
When la lista de sesiones se renderiza
Then cada fila SHALL mostrar fecha de inicio, número de mensajes y latencia mediana
And NO SHALL existir ningún botón ni link que abra `messages.content`

---

### Requirement: Métricas con tabs A-E brand

La página `/admin/metrics` SHALL renderizar cinco tabs (A: Uso, B: Sesiones, C: Latencia, D: Empatía, E: Bienestar) sobre el patrón brand. Tabs SHALL ser `text-sm font-semibold`, estado inactivo `text-ink-500 border-b-2 border-transparent`, estado activo `text-mabel-700 border-b-2 border-mabel-600`, hover `text-ink-700`. Cada tab muestra una grid de `MetricCard` + uno o dos `ChartCard` con la misma paleta brand del dashboard. Cada tab SHALL exponer botón "Exportar CSV" (anonimizado) en la cabecera del card-shell.

#### Scenario: Tabs pintan con paleta brand

Given que el admin abre `/admin/metrics` y la tab activa es "Uso"
When se renderiza la barra de tabs
Then la tab "Uso" SHALL tener `border-bottom: 2px solid var(--mabel-600)` y `color: var(--mabel-700)`
And las otras cuatro tabs SHALL tener `border-bottom: 2px solid transparent` y `color: var(--ink-500)`

#### Scenario: Export CSV por tab

Given que el admin está en `/admin/metrics` tab "Empatía"
When pulsa "Exportar CSV"
Then el archivo descargado SHALL contener las columnas relevantes a empatía con ids `sha256(value)[:16]`

---

### Requirement: Configuración brand

La página `/admin/config` SHALL renderizar cards de configuración (`bg: var(--white)`, `border: 1px solid var(--ink-200)`, `border-radius: var(--r-lg)`, `padding: 20px`) agrupadas por bloque: Guardrails, SOS, Sistema. Toggles SHALL usar paleta brand: pista `var(--ink-200)` inactiva / `var(--mabel-600)` activa, knob blanco con `shadow-sm`. Inputs `text-base` con `border: var(--ink-200)`, focus `ring: var(--ring-mabel)`. Botón "Guardar" en cada card: variante primary `bg: var(--mabel-600) text-white hover: mabel-700`. Toda edición de Config SHALL escribir un registro en `audit_logs` con `action: "system_config.update"`, `key`, `old_value`, `new_value`.

#### Scenario: Toggle activo en mabel-600

Given que el admin abre `/admin/config` y `guardrails_enabled` está activo
When se renderiza el toggle correspondiente
Then la pista del toggle SHALL ser `var(--mabel-600)` y el knob SHALL estar a la derecha

#### Scenario: Edición de Config escribe audit_log

Given que el admin cambia `sos_severity_threshold` de `3` a `2` y pulsa "Guardar"
When la mutación termina con éxito
Then el backend SHALL crear un registro en `audit_logs` con `action: "system_config.update"`, `key: "sos_severity_threshold"`, `old_value: "3"`, `new_value: "2"`

---

### Requirement: Auditoría read-only

La página `/admin/logs` SHALL renderizar la tabla de `audit_logs` con el patrón canónico (D-A3), columnas: Fecha, Actor (email enmascarado), Acción, Recurso, Detalles (collapsable). SHALL ofrecer filtros pills: rango de fecha, tipo de acción, actor. SHALL ser estrictamente read-only: ningún botón de edición ni de borrado. SHALL ofrecer "Exportar CSV" anonimizado.

#### Scenario: AuditLogs sin acciones de mutación

Given que el admin abre `/admin/logs` con 30 registros en BD
When la tabla se renderiza
Then cada fila SHALL mostrar las 5 columnas descritas
And NO SHALL existir ningún botón "Editar", "Borrar" ni "Anular" en ninguna fila

#### Scenario: Email de actor enmascarado

Given que un registro de audit_log tiene `actor_email: "admin.test@est.umb.edu.co"`
When la fila se renderiza
Then la columna "Actor" SHALL mostrar `a***@est.umb.edu.co`

---

### Requirement: Modal destructivo `DisableUserModal`

El modal de deshabilitar usuario SHALL renderizar sobre un backdrop `bg: rgba(26, 17, 16, 0.45)` (ink-900 a 45 %). La card centrada SHALL tener `bg: var(--white)`, `border-radius: var(--r-xl)`, `box-shadow: var(--shadow-brand)`, `max-width: 480px`, `padding: 0` (el padding lo lleva el header band + body). SHALL tener un header band con `bg: var(--danger-50)`, `border-bottom: 1px solid var(--danger-200)`, icono de advertencia y título "Deshabilitar usuario" en `text-lg font-display text-danger-700`. El body SHALL mostrar el email enmascarado del usuario, un textarea opcional para "Motivo (interno)" y los dos botones al pie: "Cancelar" (variante ghost, `text-ink-700`) y "Deshabilitar" (variante destructive `bg: var(--danger-600) text-white`). Al confirmar SHALL escribir audit_log con `action: "user.disable"`, `target_user_id`, `reason`.

#### Scenario: Modal centrado con backdrop brand

Given que el admin pulsa "Deshabilitar" en `/admin/users/abc123`
When el modal monta
Then existe un backdrop con `background-color` `rgba(26, 17, 16, 0.45)`
And la card del modal SHALL tener `max-width: 480px` y `border-radius: var(--r-xl)`
And el header band del modal SHALL tener `background-color: var(--danger-50)`

#### Scenario: Confirmación escribe audit_log

Given que el admin completa "Motivo: comportamiento abusivo" y pulsa "Deshabilitar"
When la mutación termina con éxito
Then el backend SHALL crear un registro en `audit_logs` con `action: "user.disable"`, `target_user_id: "abc123"`, `metadata: {"reason": "comportamiento abusivo"}`
And el modal SHALL cerrarse y la lista de usuarios SHALL reflejar el estado "Deshabilitado"

