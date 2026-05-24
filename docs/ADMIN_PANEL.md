# Panel Administrativo — Mabel IA

> Documentación operativa y técnica del panel admin. Crece a medida que validamos cada sección contra la base de datos y se documentan decisiones, fixes y reglas de negocio.

**Última actualización:** 2026-05-24 (post-migración Notion → docs/, audit de Ronda 2)
**Estado:** Dashboard ✅, Métricas ✅, Calificación empatía ✅, Usuarios ✅ (parcial), Logs ✅. Pendiente: Safety events (validación operativa detallada), Reportes (validación cruzada de cifras), Configuración.

---

## Índice

- [1. Contexto](#1-contexto)
- [2. Acceso y navegación](#2-acceso-y-navegación)
- [3. Sección: Dashboard](#3-sección-dashboard) — pendiente
- [4. Sección: Safety events](#4-sección-safety-events) — pendiente
- [5. Sección: Reportes](#5-sección-reportes) — pendiente
- [6. Sección: Métricas](#6-sección-métricas) ✅
- [7. Sección: Calificación empatía](#7-sección-calificación-empatía) — pendiente
- [8. Sección: Usuarios](#8-sección-usuarios) — pendiente
- [9. Sección: Configuración](#9-sección-configuración) — pendiente
- [10. Sección: Logs](#10-sección-logs) — pendiente
- [11. Componentes transversales](#11-componentes-transversales)
- [12. Reglas de negocio cruzadas](#12-reglas-de-negocio-cruzadas)

---

## 1. Contexto

**Mabel IA** es un asistente IA de psicoeducación para estudiantes de la Universidad Manuela Beltrán (Bogotá). El panel administrativo soporta dos funciones:

1. **Operación**: triaje de reportes y eventos de seguridad, supervisión del bienestar agregado, monitoreo técnico (latencia, costo, tokens).
2. **Investigación**: instrumentación del estudio cuasi-experimental (SUS, empatía, comparaciones pre/post wellbeing) con scoping por cohorte.

**Roles**: el panel solo está accesible a usuarios con `role='admin'`. Validado vía `require_admin` middleware en cada endpoint.

**Stack**:
- Backend: FastAPI + SQLAlchemy 2.0 async + PostgreSQL 16 (todas las columnas temporales son `TIMESTAMPTZ` desde la migración Alembic `007_timestamptz_conversion.py`, 2026-05-22 — ver `docs/DB_SCHEMA.md` §4 para detalle).
- Frontend: React 18 + Vite + TailwindCSS v4 + Zustand + Recharts.

**Privacidad**:
- **D-03**: el admin nunca ve `messages.content`.
- **L2**: identificadores potencialmente sensibles (ej. `message_id`) ocultos en payloads visibles.
- **D-08**: IDs en CSV anonimizadas con `sha256(value)[:16]`.

---

## 2. Acceso y navegación

**Layout**: sidebar fijo de 220px con secciones agrupadas:

- **Operación**: Dashboard, Safety events, Reportes
- **Datos**: Métricas, Calificación empatía, Usuarios
- **Sistema**: Configuración, Logs

**Header**: badge `Panel administrativo / Sección actual` (left) + chip de usuario admin con menú salir (right).

**Badges del sidebar**:
- **Safety events** → muestra `safety_events_active` (eventos `status='active'`). Refresca cada 60 s vía `useAdminStore.fetchOnce` / polling.
- **Reportes** → muestra `reports_pending` (reportes con `status='open'`). Mismo intervalo.

**Endpoint del badge**: `GET /api/v1/admin/dashboard` (reutiliza el endpoint del dashboard para minimizar llamadas).

---

## 3. Sección: Dashboard

> Documentación parcial — KPIs y charts cubiertos. Falta validación detallada de cada cifra contra BD.

**Ruta:** `/admin` (mounted como AdminDashboard; NO existe `/admin/dashboard` separada)
**Endpoint principal:** `GET /api/v1/admin/dashboard`
**Servicio:** `AdminMetricsService.dashboard_kpis(cohort=None)`

### 3.1 KPIs (cards superiores, fila de 7)

Cada card tiene tooltip `InfoHint` con la definición operativa.

| KPI | Qué significa | Fuente | Threshold / acción |
|---|---|---|---|
| **Total usuarios** | Total acumulado de usuarios con cuenta. Incluye estudiantes y admins. No descuenta eliminados (hard DELETE). | `COUNT(users)` | Badge `+N esta semana` si `users_new_this_week > 0` |
| **Sesiones hoy** | Sesiones iniciadas desde las 00:00 zona local del servidor. | `COUNT(sessions WHERE DATE(started_at)=CURRENT_DATE)` | — |
| **Safety events 24h** | Total de eventos de seguridad (risk_detected, redirect_shown, user_report) en las últimas 24 horas. Indicador rápido de carga de triaje. | `COUNT(safety_events WHERE created_at >= NOW()-24h)` | Verde si 0, rojo si >0. Click → `/admin/safety-events` |
| **Reportes pendientes** | Reportes en estado `open` que aún no han sido triados. Marca la cola operativa del moderador. | `COUNT(message_reports WHERE status='open')` | Verde si 0, rojo si >0. Click → `/admin/reports` |
| **Latencia promedio** | Media simple de `latency_ms` para todas las respuestas del asistente. Para detalle por percentiles ver Métricas → Técnicas. | `AVG(latency_ms)` para `role='assistant'` | Verde si ≤20s, naranja si 20-30s, rojo si >30s |
| **SUS promedio** | System Usability Scale agregada del piloto. Vacío hasta que se ingesten respuestas. | `AVG(survey_responses.score WHERE instrument='sus')` | Verde si ≥70 |
| **Nuevos esta semana** | Usuarios con `created_at` en los últimos 7 días rolling. Indica el ritmo de adopción. | `COUNT(users WHERE created_at >= NOW()-7d)` | — |

### 3.2 Gráficas (grid 2×2)

| Gráfica | Qué significa | Datos | Wrapper |
|---|---|---|---|
| **Sesiones por día** (30d) | Tendencia de uso. Detecta caídas o picos inusuales día a día. | `sessions_per_day` | `LineChartWrapper` rojo |
| **Distribución de ánimo** (30d) | Histograma de mood en buckets `Bajo (0-3)`, `Medio (4-6)`, `Alto (7-10)`. Muestra si predomina malestar o bienestar agregado. | Buckets de `checkin_payload.mood` | `BarChartWrapper` rojo |
| **Latencia por día** (30d) | Tendencia operativa. La línea roja punteada marca el umbral 20 s; cruces sostenidos indican degradación del LLM o backend. | `AVG(latency_ms)` por día | `MetricLineWithReference` con umbral 20s |
| **Activaciones de guardrails** (14d) | Conteo diario de `risk_detected`. Picos sostenidos pueden indicar palabras clave demasiado amplias o cohorte en período de mayor estrés. | `COUNT(safety_events WHERE event_type='risk_detected')` por día | `BarChartWrapper` naranja |

### 3.3 Sección inferior

- **Safety events por tipo** (donut, 30d): distribución de event_types con label central del total. **Subtitle aclaratorio**: cada `risk_detected` suele venir acompañado de su `redirect_shown` (no es pareja estadística, es estructural).
- **Últimas 5 sesiones con safety events**: tabla con `session_id_truncated` (8 chars), severidad máxima, contador, estado. **Cambio 2026-05-22**: antes era por evento individual (mostraba pares risk_detected + redirect_shown duplicados); ahora agrupa por sesión.

### 3.4 Comportamientos clave

- **Polling**: el sidebar usa este mismo endpoint (`useAdminStore.fetchOnce`) cada 60 s para refrescar badges. El dashboard se monta también dispara una llamada inicial.
- **Tabla "Últimas 5 sesiones"**: backend devuelve hasta 30 eventos con `session_id_truncated`; frontend (`groupRecentEventsBySession`) agrupa hasta encontrar 5 sesiones únicas.

---

## 4. Sección: Safety events

> Pendiente validación detallada.

Ruta: `/admin/safety-events`
Endpoint: `GET /api/v1/admin/safety-events`
Vista por defecto: agrupado por sesión (toggle "Por sesión | Lista de eventos").

Notas conocidas:
- Severidad 5 visual: solid `danger-700` + bold + icono ⚠.
- `redirect_shown` no carga severidad (renderiza como `—`).
- Payload con `message_id` redactado en frontend (`REDACTED_KEYS`).

---

## 5. Sección: Reportes

> Documentación parcial — el flujo de estados ya fue validado y ajustado el 2026-05-22.

Ruta: `/admin/reports`
Endpoints:
- `GET /api/v1/admin/reports` (lista paginada)
- `PATCH /api/v1/admin/reports/{report_id}` (transición de estado)
- `GET /api/v1/admin/reports/export.csv` (D-08)

### 5.1 Máquina de estados (post-fix)

```
open ──→ triaged ──→ resolved
   │                  │
   └────→ dismissed ←─┘
```

- `open → triaged`: revisión inicial
- `open → dismissed`: descarte directo (spam, duplicados, falsos positivos)
- `triaged → resolved`: acción correctiva tomada
- `triaged → dismissed`: revisado pero no procede

Bloquea con HTTP 409 cualquier transición no contemplada (`INVALID_TRANSITION`).

### 5.2 Rúbrica de severidad 1-5 (unificada)

| Nivel | Etiqueta | Definición operativa |
|---|---|---|
| 1 | Leve | Señal aislada, no urgente. |
| 2 | Baja | Malestar acumulándose o incomodidad menor. |
| 3 | Media | Atención requerida. Múltiples indicadores de estrés. |
| 4 | Alta | Acción correctiva pronto. Saturación de señales. |
| 5 | Crítica | Intervención inmediata. Ideación de daño explícita. Activa SOS automáticamente. |

Fuente: `frontend/src/utils/severity.ts` (single source of truth).

### 5.3 Detalle expandido

Cada reporte muestra:
- **Contexto del reportante**: texto libre escrito por el estudiante al reportar (bloque rosado claro).
- **Historial de notas del admin**: una entrada por transición con estado + timestamp + nota. Parseado desde `message_reports.details` (formato `[ISO] status: notes`).
- **Botones de cambio de estado**: solo los válidos según la máquina actual.

### 5.4 Notas operativas

- **Placeholder dinámico** del textarea según acción seleccionada (triado/resuelto/descartado/reabrir).
- **Reportante**: link al detalle de usuario `/admin/users/:reporter_id` (UUID expuesto solo para deep-link; texto truncado a 8 chars en celda).
- **`reporter_id_truncated`**: 8 primeros chars del UUID, anonimato visual.

---

## 6. Sección: Métricas

**Ruta:** `/admin/metrics?tab=usage|wellbeing|technical|safety|study`
**Endpoints:**
- `GET /api/v1/admin/metrics/usage`
- `GET /api/v1/admin/metrics/wellbeing`
- `GET /api/v1/admin/metrics/technical`
- `GET /api/v1/admin/metrics/safety`
- `GET /api/v1/admin/metrics/study`
- `GET /api/v1/admin/metrics/export.csv`
- `GET /api/v1/admin/users/cohorts` (carga del select de cohorte)

**Servicio:** `app/services/admin/metrics_service.py::AdminMetricsService`

### 6.1 Toolbar global (filtros)

| Filtro | Tipo | Default | Aplicación |
|---|---|---|---|
| **Desde** / **Hasta** | `<input type="date">` | Últimos 30 días | Manual ("Aplicar") |
| **Cohorte** | `<select>` (dinámico) | `Todas` | Inmediato al cambiar |
| **Actualizar** | Botón | — | Re-fetch sin cambiar filtros (incrementa `refreshKey`) |
| **Exportar CSV** | Botón | — | Descarga endpoint `export.csv` con los filtros actuales |
| **Limpiar filtros** | Botón (rojo, condicional) | — | Solo visible si algún filtro ≠ default. Resetea rango + cohorte y borra `?from`/`?to`/`?cohort` de la URL. |

**Rango actual visible** en el lado derecho (`Rango: YYYY-MM-DD → YYYY-MM-DD`).

**Cohorte:**
- Cargada vía `GET /api/v1/admin/users/cohorts` (devuelve `list[str]` con `SELECT DISTINCT cohort FROM users WHERE cohort IS NOT NULL ORDER BY cohort`).
- Cuando el admin asigna cohortes nuevas en `/admin/users/:id` aparecen aquí automáticamente al recargar.
- `cohortParam` actual se preserva en la lista aunque no exista en BD (protege bookmarks).

**Persistencia en URL**: `tab`, `from`, `to`, `cohort` viajan en query string para que el admin pueda compartir/bookmarkear vistas concretas.

### 6.2 Tab A — Uso

**Endpoint:** `metrics_usage(from_date, to_date, cohort)`
**Foco:** intensidad y patrón de uso del producto.

| Métrica | Qué significa | Cálculo (BD) | Visualización |
|---|---|---|---|
| **Mensajes por sesión** | Profundidad de la conversación promedio. Valores muy bajos pueden indicar abandono temprano. | `COUNT(messages) / COUNT(DISTINCT session_id)` en rango (cuenta user + assistant) | `MetricCard`, 1 decimal |
| **Duración promedio** | Tiempo activo por sesión. Solo cuenta sesiones cerradas (con `ended_at`); las abiertas se excluyen para no inflar. | `AVG(EXTRACT(EPOCH FROM (ended_at - started_at))/60)` para sesiones con `ended_at IS NOT NULL` | `MetricCard`, 1 decimal, "min" |
| **Usuarios activos por día** | Adopción real (no impresiones): cuántos usuarios distintos abrieron al menos una sesión cada día. | Conteo único diario de `user_id` con sesión iniciada en ese día | `LineChartWrapper`. Con 1 día → dot grande visible. |
| **Distribución sesiones por usuario** | Reparte usuarios en buckets para distinguir puntuales vs recurrentes. | Buckets `1-2`, `3-5`, `6-10`, `10+` agrupados por usuario | `BarChartWrapper` |

### 6.3 Tab B — Bienestar

**Endpoint:** `metrics_wellbeing(from_date, to_date, cohort)`
**Foco:** estado emocional agregado a partir de check-ins.

**Fuente de datos:** `sessions.checkin_payload` (JSONB con `mood`, `sleep`, `focus`, `note`) cuando `checkin_completed_at IS NOT NULL`.

| Métrica | Qué significa | Cálculo | Visualización |
|---|---|---|---|
| **Ánimo por día** | Tendencia agregada del estado emocional de la cohorte. Bajadas sostenidas son señal temprana de malestar grupal. | `AVG(mood)` agrupado por fecha de check-in. Escala 0-10. | `LineChartWrapper` independiente (eje propio 0-10) |
| **Horas de sueño por día** | Sueño insuficiente correlaciona fuertemente con malestar emocional. Útil para cruzar contra ánimo. | `AVG(sleep)` agrupado por fecha. Horas autorreportadas. | `LineChartWrapper` independiente (escala variable) |
| **Resumen ánimo** | Estadística descriptiva del ánimo. IC 95% con t-Student (df=n-1) — para muestras pequeñas del piloto refleja honestamente la incertidumbre. Si los extremos caen fuera de [0, 10] es señal de que n es muy pequeño para estimar la media con precisión. | Media, mediana, desviación estándar muestral, IC 95% (t-Student), min, max sobre `mood` | Tabla descriptiva |
| **Foco de preocupación por semana** | Qué temas predominan (académico, social, otro) y cómo evolucionan. Permite detectar correlación con fechas críticas (parciales, fin de semestre). | Conteo de `focus` agrupado por semana ISO | `BarChartWrapper` apilado por categoría (Académico / Otro / Social) |

**Decisiones de cálculo:**
- **IC 95% con t-Student** (`scipy.stats.t.ppf(0.975, df=n-1)`, no z=1.96). Es la elección correcta para tamaños de muestra pequeños del piloto. Con `n=3, mood=[10,0,0]` produce `[-11.01, 17.68]` (intervalo amplio que refleja honestamente la incertidumbre).
- **Charts separados** Ánimo / Sueño: las escalas dispares (0-10 vs 0-12 h) mezcladas en un solo chart pinaban la línea de sueño al eje X.

### 6.4 Tab C — Técnicas

**Endpoint:** `metrics_technical(from_date, to_date, cohort)`
**Foco:** rendimiento de la pipeline LLM (latencia y costo).

| Métrica | Qué significa | Cálculo | Visualización |
|---|---|---|---|
| **Turnos bajo 20 s** | KPI del criterio de éxito: cuántas respuestas del asistente llegaron rápido. 90% es el umbral aceptable; debajo de eso la experiencia se siente lenta. | `COUNT(messages WHERE latency_ms < 20000 AND role='assistant') / COUNT(role='assistant')` | `MetricCard` con threshold (verde ≥90%, amarillo ≥75%, rojo <75%) |
| **Costo LLM estimado** | Costo real en USD del uso del LLM, a partir de tokens persistidos × tarifas vigentes del modelo. Solo aparece cuando hay tokens registrados; con tráfico de piloto los valores son centavos o fracciones de centavo. | Estimación con tarifas del modelo configurado sobre `SUM(tokens_prompt) + SUM(tokens_completion)` agregados en el rango | `MetricCard`. **Formato adaptativo**: `< $0.005` → 4 decimales, `< $1` → 3 decimales, `≥ $1` → 2 decimales. Solo visible si hay datos no-cero. |
| **Percentiles de latencia** | P50 es la latencia mediana (50% de turnos por debajo); P95/P99 son los peores casos al 5% y 1%. El umbral 20 s define el objetivo operativo: si P95 lo cruza hay degradación percibible por los estudiantes. | P50/P95/P99 de `latency_ms` por día (solo `role='assistant'`) | Si N=1 día → 3 tarjetas (P50 verde, P95 naranja, P99 rojo). Si N≥2 → línea triple con referencia 20 s. |
| **Tokens consumidos por día** | Volumen total enviado y devuelto al LLM. Los prompt tokens incluyen el historial; los completion son la respuesta. Base para estimar costo y detectar conversaciones que crecen demasiado. | `SUM(tokens_prompt)` + `SUM(tokens_completion)` por día | `BarChartWrapper` apilado. Oculto cuando no hay tokens persistidos. |

**Persistencia de tokens (fix 2026-05-22):**
- `LLMProvider.generate_stream` ahora acepta `usage_sink: dict | None`.
- `OpenAICompatAdapter` envía `stream_options={"include_usage": True}` para que el endpoint OpenAI-compat devuelva el chunk terminal con `usage`.
- `GeminiAdapter` lee `chunk.usage_metadata.{prompt_token_count, candidates_token_count}` cumulativo.
- `chat_service.send_message` y `generate_greeting` propagan tokens al INSERT del message.

### 6.5 Tab D — Seguridad

**Endpoint:** `metrics_safety(from_date, to_date, cohort)`
**Foco:** activaciones de guardrails y palabras clave.

| Métrica | Qué significa | Cálculo | Visualización |
|---|---|---|---|
| **Tasa de infracciones** | Qué tan seguido se activan los guardrails de contenido sobre el total de turnos del asistente. Valores altos pueden indicar palabras clave demasiado amplias o cohorte en crisis. | `COUNT(safety_events WHERE event_type='risk_detected') / COUNT(messages WHERE role='assistant')` | `MetricCard` % con 2 decimales |
| **Tipos de guardrails** | Cuántas categorías distintas de safety_events se activaron en el rango. La distribución detallada se ve en el donut a la derecha. | `COUNT(DISTINCT event_type)` en rango | `MetricCard` entero |
| **Safety events por día** | Conteo diario combinado (risk_detected + redirect_shown + user_report). Picos pueden coincidir con períodos de mayor estrés académico. | Conteo total `safety_events` por día | `LineChartWrapper` rojo |
| **Tipos de guardrails (donut)** | Reparto por tipo: `risk_detected` son detecciones por palabras clave; `redirect_shown` indica que se mostró el panel SOS; `user_report` son reportes manuales del estudiante. | `COUNT(*) GROUP BY event_type` | `DonutChartWrapper`. Slices etiquetadas con `event_type` real (`redirect_shown`, `risk_detected`, `user_report`). |
| **Top keywords anonimizadas** | Qué palabras clave dispararon más activaciones. Los hashes SHA-256[:16] preservan privacidad: el admin puede ver volumen sin acceder al término crudo. | `SUM(payload->'keywords') GROUP BY keyword` con SHA-256[:16] | Tabla rank + porcentaje |

**Notas:**
- El donut usa el campo `event_type` del response del backend (no `type`).
- Eventos sin severidad propia (`redirect_shown`) muestran `—`, no `null`.

### 6.6 Tab E — Estudio (cuasi-experimental)

**Endpoint:** `metrics_study(cohort)` *(sin rango — agrega todo el histórico de la cohorte)*
**Foco:** validación de hipótesis del estudio cuasi-experimental.

**Requiere cohorte explícita**. Sin cohorte muestra empty state:
> *Selecciona una cohorte para ver los resultados del estudio.*
> *Las métricas del estudio cuasi-experimental (SUS, empatía, comparaciones pre/post) solo son representativas cuando se filtran por la cohorte participante.*

Rationale: mezclar usuarios del piloto con cuentas de prueba/admin distorsiona promedios y comparaciones.

| Métrica | Qué significa | Fuente | Visualización |
|---|---|---|---|
| **SUS promedio** | System Usability Scale: instrumento estandarizado de 10 preguntas (escala 0-100). 70 es "aceptable", 80+ es "bueno". Criterio de éxito del estudio. | `AVG(score) FROM survey_responses WHERE instrument='sus'` filtrado por cohorte | `MetricCard` con threshold (verde si ≥70) |
| **Empatía ≥ 4/5** | % de respuestas calificadas con 4 o 5 por evaluadores entrenados (rúbrica de empatía). Objetivo del estudio: ≥80%. | `% empathy_ratings.score ≥ 4` | `MetricCard` con threshold (verde ≥80%, amarillo ≥60%, rojo <60%) |
| **Comparaciones pre/post** | Cuántas variables tienen mediciones pre y post para los mismos usuarios. t-test pareado si los datos pasan Shapiro-Wilk (normalidad); Wilcoxon signed-rank si no. Reporta Cohen's d como effect size. | Conteo de variables emparejadas con t-test (`scipy.stats.ttest_rel`) o Wilcoxon (`scipy.stats.wilcoxon`) | Cards con N, mean_pre, mean_post, diff, Cohen's d, p-value |
| **Distribución SUS** | Útil para distinguir si el promedio refleja consenso o una distribución bimodal (algunos usuarios contentos, otros no). | Buckets por puntaje | `BarChartWrapper` |
| **Distribución empatía** | Cuántas calificaciones cayeron en cada nivel (1=sin empatía, 5=altamente empática). Permite ver si el promedio oculta una cola problemática. | Buckets 1-5 | `BarChartWrapper` |

**Métodos estadísticos (per D-05):**
- t-test pareado si Shapiro-Wilk no rechaza normalidad (`p ≥ 0.05`).
- Wilcoxon signed-rank si rechaza normalidad o muestra muy pequeña.
- Reportar Cohen's d como effect size.

**Hoy (2026-05-22)**: `survey_responses` está vacío y solo hay 1 `empathy_rating` — el tab está listo pero sin datos hasta que arranque la ingesta del piloto.

### 6.7 Validación cruzada UI ↔ BD (2026-05-22)

Última validación contra BD con rango `2026-04-22 → 2026-05-22`, cohorte vacía:

| Métrica UI | UI | DB | ✓ |
|---|---|---|---|
| Mensajes/sesión | `3.5` | 35 msgs / 10 sesiones = 3.50 | ✅ |
| Duración promedio | `291.2 min` | 291.17 min | ✅ |
| Usuarios activos día | 1 dot @ 22-may | 1 user (d6774630) con sesiones ese día | ✅ |
| Distribución sesiones | bucket 6-10 = 1 | 1 user con 10 sesiones | ✅ |
| Mood mean | `3.33` | `[10, 0, 0]` → 3.33 | ✅ |
| Mood median | `0.00` | mediana de `[10, 0, 0]` | ✅ |
| Mood IC95 | `[-11.01, 17.68]` | t-Student df=2 | ✅ |
| Pct under 20s | `100%` | 17 msgs con latency, máx 13.7 s | ✅ |
| Costo LLM | `$0.0001` | tokens persistidos post-fix | ✅ |
| P50/P95/P99 | 5.31/9.76/13.66 s | p50=5310, p95=9755, p99=13658 ms | ✅ |
| Tasa infracciones | `0.43%` | 0.4286 (3 risk_detected /7 turns) | ✅ |
| Tipos guardrails | 3 | redirect_shown=9, risk_detected=5, user_report=1 | ✅ |

### 6.8 Historial de fixes

| Fecha | Issue | Fix |
|---|---|---|
| 2026-05-22 | IC95 usaba z=1.96 (incorrecto n pequeño) | Cambio a t-Student `df=n-1` |
| 2026-05-22 | Línea sueño invisible mezclada con ánimo | Separación en 2 charts independientes |
| 2026-05-22 | Latencia chart vacío con 1 día | Render como 3 tarjetas cuando N=1 |
| 2026-05-22 | Tokens no se persistían (0/28 cobertura) | `usage_sink` pattern en LLM adapters + INSERT |
| 2026-05-22 | Donut "value, value, value" | Mismatch `event_type`/`type` + `formatter` en Legend |
| 2026-05-22 | Charts vacíos sin contexto | Empty states + ocultar costo/tokens cuando no hay datos |
| 2026-05-22 | Dot invisible con 1 punto en línea | `dot={r:6}` cuando `data.length === 1` |
| 2026-05-22 | Costo "$0.00" cuando es $0.0001 | Formato adaptativo 4/3/2 decimales |
| 2026-05-22 | Warning `width(-1) height(-1)` donut | `minWidth/minHeight={0}` en ResponsiveContainer |
| 2026-05-22 | Foco preocupación X axis con "0" | Bug spread `{week, ...vals}` invertido |
| 2026-05-22 | Cohorte auto-set en tab Estudio | Removido + empty state explicativo |
| 2026-05-22 | Cohorte free-text input | `<select>` dinámico desde `/admin/users/cohorts` |
| 2026-05-22 | Sin botón limpiar todos los filtros | "Limpiar filtros" reset rango + cohorte |
| 2026-05-22 | Falta contexto sobre qué mide cada métrica | Nuevo `InfoHint` ("i" tooltip) en KPIs y chart titles de los 5 tabs |
| 2026-05-22 | `<button> cannot contain a nested <button>` por InfoHint dentro de MetricCard clickeable | InfoHint refactorizado a `<span role="button" tabIndex={0}>` con stopPropagation; conserva accesibilidad sin violar jerarquía DOM |
| 2026-05-22 | Donut warning `width(-1)` persistía pese a `minWidth/minHeight={0}` | DonutChartWrapper ahora gate el render con `useState mounted` + placeholder de la misma altura |

---

## 7. Sección: Calificación empatía

**Ruta:** `/admin/empathy-ratings?cohort=<cohorte>`
**Endpoints:**
- `GET /api/v1/admin/empathy-ratings/queue?limit=&cohort=`
- `POST /api/v1/admin/empathy-ratings`
- `GET /api/v1/admin/empathy-ratings/stats?cohort=`

**Servicio:** `app/services/admin/empathy_service.py::AdminEmpathyService`
**Fuente principal:** tabla `empathy_ratings` (`message_id`, `rater_id`, `score`, `criteria` JSONB, `created_at`).

### 7.1 Propósito operativo

Alimenta el criterio de éxito **"empatía ≥ 4/5 en ≥ 80% de las respuestas"** del estudio cuasi-experimental. Cada respuesta del asistente puede ser evaluada por **uno o más administradores** entrenados, según una rúbrica de cinco criterios cualitativos + una puntuación numérica 1-5. Es la principal evidencia humana de la calidad afectiva de Mabel.

### 7.2 Toolbar

| Control | Default | Comportamiento |
|---|---|---|
| **Cohorte** (select dinámico) | `Seleccionar cohorte…` (vacío) | Cargado desde `GET /admin/users/cohorts`. Aplicación inmediata al cambiar. |
| **Quitar filtro** | — | Solo visible si hay cohorte. Vuelve al estado vacío. |
| **Actualizar** | — | Refetch de stats + cola. |

**Empty state**: sin cohorte el componente muestra "Selecciona una cohorte para empezar a calificar" + justificación (sin filtro se mezclarían respuestas del piloto con tráfico de cuentas de prueba). No carga datos hasta que se elija una cohorte.

### 7.3 KPIs (3 tarjetas)

| Métrica | Qué significa | Cálculo | Visualización |
|---|---|---|---|
| **Total calificaciones** | Cuántas calificaciones se han registrado para la cohorte. Crece conforme cada admin evalúa. | `COUNT(empathy_ratings) JOIN messages JOIN sessions WHERE user.cohort=:c` | `MetricCard` entero |
| **Promedio** | Media simple del puntaje. Indicador rápido de calidad agregada (1=sin empatía, 5=altamente empática). | `AVG(score)` filtrado por cohorte | `MetricCard` 2 decimales |
| **Pct ≥ 4** | Porcentaje de calificaciones con score 4 o 5. **Criterio de éxito del estudio: ≥ 80%.** | `COUNT(score>=4) / COUNT(*) × 100` | `MetricCard` % con threshold (verde ≥80, amarillo ≥60, rojo <60) |

### 7.4 Distribución de puntajes

`BarChartWrapper` con buckets `1`, `2`, `3`, `4`, `5`. Permite distinguir si el promedio refleja consenso o esconde una distribución con cola problemática (ej. media 3.5 que oculta varios 1's).

### 7.5 Cola de mensajes a calificar

**Qué es cada item**: una respuesta del asistente (`role='assistant'`) generada por usuarios de la cohorte filtrada, que aún no ha sido calificada por **ningún admin** (no solo el actual). Se descartan al evaluarlas.

**Filtro de cola** (SQL conceptual):
```sql
SELECT m.* FROM messages m
JOIN sessions s ON s.id = m.session_id
JOIN users u ON u.id = s.user_id
WHERE m.role = 'assistant'
  AND u.cohort = :cohort
  AND NOT EXISTS (
    SELECT 1 FROM empathy_ratings er WHERE er.message_id = m.id
  )
ORDER BY <random>
LIMIT 20
```

**Cada tarjeta muestra**:
- `msg #<8 chars>` → `messages.id` truncado.
- **Sesión** → `sessions.started_at` (contexto temporal).
- **Mensaje** → `messages.created_at` (cuándo se generó la respuesta).
- **Mensaje previo del estudiante** (opcional) → `messages` con `role='user'`, mismo `session_id`, `created_at < m.created_at` ORDER BY DESC LIMIT 1. Da contexto al rater.
- **Respuesta del asistente** → `messages.content` (lo que se evalúa, con `whiteSpace: pre-wrap` y scroll interno `maxHeight: 260px` + `overscrollBehavior: contain`).
- **Puntaje 1-5** → `radiogroup` con 5 botones (1=muy bajo, 5=excelente).
- **Criterios cualitativos** (5 checkboxes):
  - `empathic_tone` — Tono empático
  - `emotional_validation` — Validación emocional
  - `no_hallucinations` — Sin alucinaciones
  - `constructive_suggestion` — Sugerencia constructiva
  - `no_clinical_diagnosis` — Sin diagnóstico clínico

**POST**: al confirmar se envía `{message_id, score, criteria}`. Auditoría completa (D-12). Si el rater ya calificó ese mensaje → HTTP 409 + toast "Ya calificaste este mensaje".

### 7.6 Validación cruzada UI ↔ BD (2026-05-22, cohorte `piloto-fase1`)

| Métrica UI | UI | DB | ✓ |
|---|---|---|---|
| Total calificaciones | `1` | `COUNT(empathy_ratings)` = 1 | ✅ |
| Promedio | `4.00` | `AVG(score)` = 4.0 | ✅ |
| Pct ≥ 4 | `100%` | 1/1 = 100% | ✅ |
| Distribución | 1 barra en bucket "4" | 1 rating con score=4 | ✅ |
| Cola pendiente | `12` | 13 assistant messages cohorte - 1 ya rated = 12 | ✅ |

### 7.7 Limitaciones operativas conocidas

- **Multi-rater**: hoy el filtro de cola muestra TODOS los mensajes sin calificar — un mensaje calificado por un admin desaparece de la cola de los demás. Si se requiere inter-rater reliability formal, hay que ajustar el filtro a "no calificado **por este rater**" en vez de "no calificado por nadie".
- **Sampling random**: el orden actual es aleatorio (`ORDER BY random()`). Sin reproducibilidad por seed. Aceptable para piloto.
- **N pequeño**: con 1 calificación los KPIs son volátiles. Una vez el piloto produzca ≥ 30 calificaciones por cohorte, el porcentaje empezará a estabilizarse.

### 7.8 Historial de fixes

| Fecha | Issue | Fix |
|---|---|---|
| 2026-05-22 | Auto-set `cohort=piloto-fase1` al montar (sticky cross-page) | Removido; ahora requiere selección explícita |
| 2026-05-22 | Cohort como free-text input (inconsistente con Métricas) | `<select>` dinámico desde `/admin/users/cohorts`, aplicación inmediata |
| 2026-05-22 | Falta empty state sin cohorte | Bloque "Selecciona una cohorte…" + esconde stats/queue hasta elegir |
| 2026-05-22 | Falta contexto en KPIs y distribución | `InfoHint` en los 3 KPIs y en el título de la distribución |
| 2026-05-22 | Scroll chaining: ruleta dentro del card del mensaje propagaba al main, sumando con bug de min-h-0 del layout y permitía "sobrepasar" el final | `overscrollBehavior: contain` en el card + `min-h-0` en `<main>` del AdminLayout + `html/body/#root { height: 100% }` y `body { overflow: hidden }` en `index.css` (fix global del scroll fantasma) |
| 2026-05-22 | "Cola pendiente (X)" engañoso — solo contaba items cargados, no total real; botón "Cargar más" siempre visible | Backend `/queue` devuelve `{items, total_pending}`; UI muestra `Cola pendiente (12) · mostrando 5 de 12` y oculta el botón cuando `loaded >= total` |
| 2026-05-22 | Falta señal visual cuando la respuesta es un saludo automático (no responde a input previo) | Badge **"Saludo automático"** en el header del card cuando `preceding_user_message` es null/vacío |
| 2026-05-22 | Greeting duplicado: race condition entre `useEffect` de StrictMode → 2 saludos persistidos por sesión | UNIQUE INDEX parcial `uq_messages_session_greeting` + try/except IntegrityError en `chat_service.generate_greeting`. Limpieza retroactiva de 4 sesiones duplicadas (Evolución 008 del schema) |
| 2026-05-22 | No se podía revisar/editar calificaciones ya hechas | Nueva pestaña **Calificadas** en el header de la cola con toggle vs Pendientes. Backend: `GET /admin/empathy-ratings/rated` (cross-rater) + `PATCH /{rating_id}` (solo dueño). Schema: `empathy_ratings.updated_at TIMESTAMPTZ`. Audit: `empathy_rate_updated`. UI: el card muestra chip "Tu calificación" / "Otro evaluador" según `is_mine`, score y criterios preseleccionados, botón "Actualizar calificación" cuando edita, read-only cuando es de otro admin. Footer del card muestra "Calificado el X · editado el Y · por Z" |
| 2026-05-22 | Click en un criterio cualitativo con scroll al final → la página saltaba más abajo (root cause real del crash visual reportado como "pantalla en blanco") | Reemplazado el patrón `<label><input sr-only/></label>` por `<button role="checkbox" aria-checked>` nativo. El input absolute hacía que el browser disparara `scrollIntoView` automático al recibir focus tras el click. El button está en flujo normal, conserva accesibilidad (Enter/Space, aria-checked) y no provoca auto-scroll |

### 7.9 Conclusión operativa (para Manual técnico)

`/admin/empathy-ratings` es la pieza de **instrumentación humana** del estudio. Su salida directa (`COUNT(score≥4) / COUNT(*)`) alimenta el KPI `pct_empathy_4_or_above` de la pestaña Estudio en `/admin/metrics`, que a su vez se compara contra el criterio de éxito ≥ 80%. La validez de ese KPI depende de:

1. **Cobertura suficiente** de calificaciones por cohorte (recomendado N ≥ 30 antes de interpretar el porcentaje).
2. **Independencia del rater respecto al estudio** (recomendado al menos 2 admins evaluando en ciego para inter-rater reliability).
3. **Calibración previa**: los admins deben revisar la rúbrica de 5 criterios antes de comenzar para evitar drift entre raters.

El componente preserva las garantías de privacidad (D-03 sigue vigente — el rater ve solo la respuesta del asistente y el mensaje previo, no el resto de la conversación ni la identidad del estudiante), y deja trazabilidad completa en `audit_logs` para cada calificación creada.

---

## 8. Sección: Usuarios

> Documentación parcial — validación detallada pendiente.

**Ruta:** `/admin/users` y `/admin/users/:id`
**Endpoints:**
- `GET /api/v1/admin/users` (paginado, filtros: `q`, `status`, `consent_status`, `cohort`, `created_from`/`to`)
- `GET /api/v1/admin/users/cohorts` (lista distinct de cohortes — documentado en § 6.1)
- `GET /api/v1/admin/users/{user_id}` (detalle)
- `PATCH /api/v1/admin/users/{user_id}/disable` (con `reason` requerido)
- `PATCH /api/v1/admin/users/{user_id}/enable` (reverso de disable, **agregado 2026-05-22**)
- `PATCH /api/v1/admin/users/{user_id}/cohort` (asignar/limpiar cohorte)

### 8.1 Estado de cuenta (lifecycle)

```
created ──→ active ──→ disabled ──→ active (re-enable)
                          │
                          └─→ active (hard DELETE preserva safety_events con user_id NULL)
```

- **active**: `disabled_at IS NULL`. La cuenta puede iniciar sesión.
- **disabled**: `disabled_at IS NOT NULL` + `disabled_reason` requerido (CHECK constraint `chk_users_disabled_reason`).
- **re-enable**: PATCH `/enable` limpia ambos campos atómicamente y registra entrada en `audit_logs` con `action='enable_user'` que conserva el `previous_reason` para preservar la trazabilidad del ciclo disable/enable.
- **Admins protegidos**: la UI no expone los botones disable/enable para usuarios con `role='admin'`. El backend además rechaza disable de admins con HTTP 403 (`CANNOT_DISABLE_ADMIN`).

### 8.2 Acciones de la columna "Acciones" (post-fix 2026-05-22)

| Estado del usuario | Botón visible | Resultado |
|---|---|---|
| Admin (cualquier estado) | `—` (sin acción) | Protección anti lock-out |
| Activo + no admin | **Deshabilitar** (rojo) | Abre `DisableUserModal` que pide razón |
| Deshabilitado + no admin | **Activar** (verde) | `confirm()` nativo → PATCH `/enable` → toast + refetch |

### 8.3 Historial de fixes

| Fecha | Issue | Fix |
|---|---|---|
| 2026-05-22 | No había forma de reactivar una cuenta deshabilitada (`—` en celda Acciones) | Nuevo endpoint `PATCH /enable` + service `enable_user` + botón verde "Activar" con confirm. Audit log conserva `previous_reason`. |
| 2026-05-22 | No había manera de eliminar definitivamente una cuenta deshabilitada ni de asignar cohorte / cambiar lifecycle de varios usuarios a la vez | **Multi-select + barra de acción contextual**. `<input type="checkbox">` por fila (admins excluidos), header tri-state, barra sticky con dropdowns "Asignar cohorte" (cohortes existentes + Nueva + Quitar) y "Acciones" (Deshabilitar / Reactivar / Eliminar permanentemente). Modal `BulkActionModal` con split preview (eliminables vs omitidos), input `CONFIRMAR` para delete y razón obligatoria para disable. Cuando hay selección activa, click sobre una fila TOGGLE su selección en vez de navegar al detalle (patrón Gmail) — un hint en la barra lo explica. Endpoints: `PATCH /admin/users/cohort/bulk` + `POST /admin/users/bulk-action {action: disable|enable|delete}` + `DELETE /admin/users/{id}` (solo si está disabled). El detalle `/admin/users/:id` ahora también expone "Reactivar cuenta" y "Eliminar permanentemente" cuando la cuenta está deshabilitada. Audit `delete_user` agregado a `ALLOWED_ACTIONS`. |

---

## 9. Sección: Configuración

> Pendiente validación detallada.

Ruta: `/admin/config`
Endpoint: `GET/PUT /api/v1/admin/system-config`
Llaves conocidas (`system_config` table):
- `sos_hotline_numbers` (JSON array)
- `safety_keywords` (JSON array)
- `sos_severity_threshold` (int, default 4)
- `guardrails_enabled` (bool)

---

## 10. Sección: Logs (auditoría)

**Ruta:** `/admin/logs`
**Endpoints:**
- `GET /api/v1/admin/logs` (paginado, filtros: `actor_id`, `actor_role`, `action`, `from`, `to`)
- `GET /api/v1/admin/logs/export.csv`

**Servicio:** `app/services/admin/audit_logs_service.py`
**Fuente:** tabla `audit_logs` (INMUTABLE, append-only).

### 10.1 Schema (post-Evolución 007, 2026-05-22)

```sql
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role   TEXT NOT NULL DEFAULT 'admin'
               CHECK (actor_role IN ('admin', 'student', 'system')),
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  detail       JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_logs_actor_time  ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_time ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_role_time   ON audit_logs(actor_role, created_at DESC);
```

- `actor_id ON DELETE SET NULL`: el log sobrevive a la eliminación del usuario.
- `actor_role`: distingue acciones administrativas, de estudiante, y eventos del sistema.

### 10.2 Catálogo de acciones registradas

#### Acciones de **admin** (originadas en el panel)

| Acción | Cuándo se registra | `details` típico |
|---|---|---|
| `login` | Admin inicia sesión exitosamente | `{role, remember_me}` |
| `view_user` | Admin abre `/admin/users/:id` | — |
| `disable_user` | Admin deshabilita una cuenta | `{reason}` |
| `enable_user` | Admin reactiva una cuenta | `{previous_reason}` |
| `update_cohort` | Admin asigna/limpia cohorte | `{from, to}` |
| `change_config` / `update_system_config` | Admin modifica `system_config` | `{key, before, after}` |
| `review_report` | Admin cambia estado de un reporte | `{status, notes, previous_status}` |
| `review_safety_event` | Admin triagea un safety event | `{status, notes}` |
| `export_data` | Admin descarga un CSV | `{resource, filters, rows}` |
| `empathy_rate` | Admin califica un mensaje en la cola | `{score, criteria}` |
| `empathy_rate_updated` | Admin actualiza una calificación previa (Evo 009) | `{score_before, score_after, criteria}` |
| `delete_user` | Admin elimina permanentemente una cuenta deshabilitada (multi-select bulk o `/admin/users/{id}` action) | `{email_masked, reason}` |
| `update_system_config` | Variante de `change_config` para la tabla `system_config` específicamente | `{key, before, after}` |

#### Acciones de **estudiante** (originadas por el propio usuario)

| Acción | Cuándo se registra | `details` típico |
|---|---|---|
| `user_register` | Estudiante crea su cuenta | `{email_masked}` |
| `user_login` | Estudiante inicia sesión exitosamente | `{remember_me}` |
| `user_delete` | Estudiante elimina su cuenta (`DELETE /users/me`). El audit se emite ANTES del hard DELETE; tras el DELETE, `actor_id` queda NULL por el FK SET NULL, y `details.email` preserva el identificador anónimo | `{email}` |
| `consent_granted` | Estudiante acepta el consentimiento informado | `{scope, version_id}` |
| `consent_revoked` | Estudiante revoca su consentimiento | `{scope}` |
| `password_reset_requested` | Estudiante solicita reset (fail-soft anti-enumeration: si el email no existe, NO se loguea para no filtrar existencia) | `{email}` |
| `password_reset_completed` | Estudiante completa el reset con token válido | — |
| `history_toggle_off` | Estudiante apaga `save_history`. El service ramifica por scope: si `solo_uso` → hard delete; si `uso_mejora_anon` → soft hide masivo de sesiones existentes. | `{affected_sessions, scope, behavior}` |
| `history_toggle_on` | Estudiante enciende `save_history` (sesiones nuevas nacen visibles; las soft-hidden previas NO se re-exponen) | `{}` |
| `session_hidden` | Estudiante oculta una sesión individual del sidebar | `{session_id, reason: 'user_per_session'}` |
| `session_deleted_hard` | Estudiante hace hard DELETE de una sesión individual | `{session_id, messages_deleted}` |
| `user_messages_hard_delete` | Estudiante elimina TODAS sus conversaciones (preserva cuenta) desde Settings | `{sessions_deleted, messages_deleted}` |
| `session_rated` | Estudiante califica una sesión cerrada con HeartRating (upsert en `session_ratings`, Evo 011) | `{session_id, rating}` |

#### Eventos de **sistema** (sin actor humano identificable)

| Acción | Cuándo se registra | `details` típico |
|---|---|---|
| `user_login_failed` | Login con credenciales inválidas. `actor_id = NULL`. NO incluye password ni hash. | `{email}` |

### 10.3 Filtros disponibles en `/admin/logs`

| Filtro | Tipo | Notas |
|---|---|---|
| **Actor (email o ID)** | input texto | Busca por `actor_id` exacto (UUID) o email (próxima iteración). |
| **Rol** | select | `Todos / Admin / Estudiante / Sistema`. Mapea a `actor_role`. |
| **Acción** | select agrupado | Tres `<optgroup>`: Admin / Estudiante / Sistema, con etiquetas legibles. |
| **Desde / Hasta** | date range | Acotación temporal (TIMESTAMPTZ). |

Botón **Exportar CSV** respeta los filtros activos (los IDs se anonimizan con SHA-256[:16] per D-08).

### 10.4 Renderizado de cada fila

| Columna | Contenido |
|---|---|
| **Fecha / hora** | `created_at` formateado `dd/mm/aaaa hh:mm:ss` zona local |
| **Actor** | `actor_email_masked` o `actor_id.slice(0, 8)`. Para `system` muestra "— (sistema)". |
| **Rol** | Chip de color: `Admin` (mabel), `Estudiante` (info), `Sistema` (ink) |
| **Acción** | Chip con etiqueta legible; color según la familia (rojo destructivo, verde positivo, amarillo cambio, etc.) |
| **Detalle** | `target_type:target_id_truncado` + primera key/value de `details` (truncado a 80 chars) |
| **IP** | `ip_address` o `—` |

Click en la fila expande detalle completo (JSON pretty + grilla con Log ID, Actor, Rol, Target, IP).

### 10.5 Qué guarda audit_logs vs tablas naturales

`audit_logs` es **journal de eventos**, no mirror del estado. Captura "quién hizo qué, cuándo, desde dónde". Los datos sustantivos viven en sus tablas naturales y `audit_logs` los referencia vía `target_id`.

| Evento | En `audit_logs` | Dato sustantivo |
|---|---|---|
| Registro de cuenta | huella mínima | `users` (row completa) |
| Login exitoso/fallido | **única fuente** (JWT es stateless) | — |
| Eliminación de cuenta | **única fuente** (la row de `users` desaparece) | — |
| Consent grant/revoke | huella + `target_id=consent.id` | `consents`, `consent_versions` |
| Password reset | huella | `password_reset_tokens` (token_hash, expires, used_at) |
| view/disable/enable/update_cohort | huella + `target_id=user.id` | `users` |
| review_report | huella + `target_id=report.id` + `details.notes` | `message_reports` |
| review_safety_event | huella + `target_id=event.id` | `safety_events` |
| change_config | huella con `details.{before, after}` | `system_config.value` |
| export_data | huella + filtros aplicados | — (CSV se genera on-the-fly) |
| empathy_rate | huella + `target_id=rating.id` | `empathy_ratings` |

**Lo que NO entra en `audit_logs`** (por diseño): mensajes a Mabel (tabla `messages`), inicio/fin de sesión de chat (`sessions`), check-ins completados (`sessions.checkin_payload`), activaciones de guardrail (`safety_events`), reportes creados por estudiantes (`message_reports`). Ya son sus propias tablas con estructura rica; loguearlos también en audit_logs duplicaría volumen sin valor añadido.

### 10.6 Garantías legales/forenses

- **Append-only**: no hay UPDATE/DELETE de audit_logs en código de producción. El frontend lo declara explícitamente en el detalle expandido.
- **FK SET NULL**: la fila sobrevive a la eliminación del usuario. Útil para investigar fraudes / abusos post-mortem.
- **Ningún campo expone secretos**: `password_reset_completed` no guarda el token; `user_login_failed` solo guarda el email (no la contraseña intentada); `change_config` evita `gemini_api_key` (sería filtrar la credencial — el campo se enmascara antes de loguear).
- **Identidad LLM oculta**: ningún `details` menciona `Google` / `Gemini` directamente. Solo `model` con el nombre técnico configurado.
- **Cumplimiento Ley 1581/2012**: la bitácora soporta solicitudes de "registro de acceso a mis datos" del titular.

### 10.7 Historial de fixes

| Fecha | Issue | Fix |
|---|---|---|
| 2026-05-22 | Solo se loguean acciones de admin; faltan eventos del estudiante (register, login, delete, consent, password reset) y del sistema (login fallido) | Evolución 007: `admin_id` → `actor_id`, agregado `actor_role`, 7 acciones nuevas en `auth_service`, `account_service`, `consent_service` |
| 2026-05-22 | Frontend `/admin/logs` mostraba "—" en actor + filtros rotos por mismatch admin_id↔actor_id | Rewrite de `AuditLogs.tsx`: columnas `actor_id/actor_role/actor_email_masked`, nuevo filtro Rol, optgroup por familia de acciones, chips con etiquetas legibles |
| 2026-05-22 | `enable_user` aparecía sin label legible | Mapeo agregado en `ACTION_LABELS` (`Reactivar usuario`) |

### 10.8 Conclusión operativa (para Manual técnico)

`/admin/logs` es la **bitácora primaria** del sistema. Soporta tres clases de actores (admin, estudiante, sistema) y cubre el lifecycle completo de una cuenta (registro → consent → login(s) → uso → posibles incidentes → eliminación) más todas las intervenciones administrativas (deshabilitación/reactivación, triaje de reportes, exports). Tres garantías de integridad lo hacen válido como evidencia: (a) append-only sin UPDATE/DELETE, (b) FK ON DELETE SET NULL preserva el log post-eliminación, (c) no contiene secretos (passwords, tokens, API keys). Cuando se requiera reconstruir un evento completo (qué hizo X usuario el día Y), `audit_logs` da el **cuándo y desde dónde**; las tablas naturales aportan el **qué quedó persistido** vía `target_id`.

Limitación conocida: el filtro "Actor" hoy solo matchea por UUID exacto, no por email. Para una búsqueda por email se requeriría un JOIN backend o un endpoint de resolución. Aceptable para el piloto.

---

## 11. Componentes transversales

### 11.1 Chart wrappers (`frontend/src/components/admin/charts/`)

| Wrapper | Responsabilidad | Empty state |
|---|---|---|
| `LineChartWrapper` | Líneas temporales | "Sin datos suficientes" cuando `data.length === 0`. Dot grande con N=1. |
| `BarChartWrapper` | Barras (apiladas o no) | "Sin datos suficientes" |
| `DonutChartWrapper` | Distribuciones categóricas | "Sin datos suficientes" cuando total=0. `Legend formatter` recupera `payload.name`. |
| `MetricCard` | KPI numérico | `value="—"` cuando es null. Acepta `info` opcional para tooltip. |
| `chartTheme.ts` | Tokens compartidos | `formatDateTick` parsea `YYYY-MM-DD` como local para evitar off-by-one timezone. |

### 11.1.bis `InfoHint` (`frontend/src/components/admin/InfoHint.tsx`)

Componente reutilizable para añadir explicaciones contextuales discretas. Es un círculo de 13px con la letra **i** en `var(--ink-300)` (apenas visible) que abre un tooltip al hover/focus.

Características:
- **Discreto**: borde fino en `ink-300`, color `ink-400`. No compite visualmente con la métrica.
- **Tooltip oscuro**: fondo `ink-900` blanco a 240px ancho, alineado a la izquierda por defecto.
- **Viewport-aware**: si el tooltip se saldría del lado derecho del viewport, se ancla por la derecha automáticamente.
- **Accesible**: `role="button"`, `tabIndex={0}`, `aria-describedby` apunta al tooltip cuando abierto, Enter/Space activa, `Esc` lo cierra cuando focused.
- **Touch-friendly**: click toggling sobre dispositivos sin hover.
- **`<span role="button">` no `<button>`**: necesario porque InfoHint suele anidarse dentro de `<MetricCard>` que cuando tiene `onClick` se renderiza como `<button>`. HTML prohíbe botón anidado y React emite hydration error. El span con role/tabIndex preserva accesibilidad sin romper la jerarquía DOM.
- **stopPropagation en click**: el click sobre el icono no dispara el `onClick` del MetricCard padre (que podría navegar).

Uso típico:
```tsx
<MetricCard label="P50 latencia" value="5.31 s" info="Latencia mediana del rango." />
<ChartCard title="Tokens consumidos" info="Prompt + completion por día." />
```

### 11.2 Severity utility (`frontend/src/utils/severity.ts`)

Single source of truth para rúbrica 1-5: `SEVERITY_LABELS`, `SEVERITY_DESCRIPTIONS`, `severityShort()`, `severityLong()`. Usado en:
- `/admin/reports` (filtro + badge)
- `/admin/safety-events` (filtro + badge)
- `/admin/config` (slider de threshold)
- `ReportModal` (botones del estudiante al reportar)

### 11.3 Toolbar/FilterBar patterns

- Filtros se aplican vía query params en URL (`?from=`, `?to=`, `?cohort=`, `?status=`, etc.).
- Botón "Limpiar filtros" rojo (border + texto), solo visible si algún filtro ≠ default.
- Filtros de búsqueda/select: aplicación inmediata. Filtros con rango/fecha: requieren "Aplicar".

---

## 11.bis Deuda técnica conocida (post code-review 2026-05-22)

Resuelta en dos pasadas el 2026-05-22 antes del deploy. Tabla histórica conservada como bitácora.

### Pass 2 (post pre-commit `/review`, alta severidad)

| # | Item | Resolución |
|---|---|---|
| **F1** | `dashboard_kpis` mezclaba cutoffs UTC (`_utc_now() - timedelta(days=N)`) con buckets `_bogota_day_trunc`: primer/último bar de cada serie quedaba parcial (0-5h corto) cuando el request caía antes de 05:00 UTC. | Nuevo helper `_bogota_window_start(N)` en `metrics_service.py` devuelve `_to_dt(_bogota_today() - timedelta(days=N))`. `dashboard_kpis` usa `_bogota_window_start(7/14/30)` para los rolling windows que alimentan series por día. `day_ago` se mantiene rolling 24h porque solo alimenta KPIs escalares. |
| **F2** | `chat_service.generate_greeting` greeting-race: read-modify-write Python-side (`winner.tokens_prompt = X + delta; commit`) era no atómico — 3 losers concurrentes podían lost-update entre sí. | Reemplazado por `UPDATE messages SET tokens_prompt = COALESCE(...,0)+:delta, tokens_completion = ... WHERE id = :winner_id` SQL-side. Los deltas concurrentes serializan por row lock; nada se pierde. |
| **F3** | El modelo SQLAlchemy `Message` no declaraba el partial UNIQUE INDEX `uq_messages_session_greeting` (mig 009). Próximo `alembic revision --autogenerate` propondría `op.drop_index(...)` y regresaría la protección race. Mismo bug pre-existente en `User.cohort` (`idx_users_cohort`). | Añadidos `Index(...)` en `__table_args__` de los 7 modelos relevantes: Message (`idx_messages_session_time`, `idx_messages_latency`, `uq_messages_session_greeting`), User (`idx_users_cohort`), Session (`idx_sessions_user_time`, `uq_sessions_user_active`), Consent (`idx_consents_user_latest`), ConsentVersion (`idx_consent_versions_active`). Tipos de `actor_role` y `cohort` alineados a `sa.Text`. Validado con `alembic check` → `No new upgrade operations detected`. |
| **F4** | `RENAME COLUMN admin_id → actor_id` en mig 008 dejaba la FK con nombre legacy `audit_logs_admin_id_fkey`. Live DB confirmó la divergencia. Drift vs `db/schema_postgresql.sql`. | Añadido `ALTER TABLE audit_logs RENAME CONSTRAINT audit_logs_admin_id_fkey TO audit_logs_actor_id_fkey` idempotente (guard vía `pg_constraint`) en mig 008 upgrade y downgrade simétrico. Verificado: live DB ahora `audit_logs_actor_id_fkey | FOREIGN KEY (actor_id) REFERENCES users(id)`. |
| **F5** | CSV export tab `usage`: columna `date` Bogotá pero `started_at`/`ended_at` ISO crudo UTC (`+00:00`). Sesiones entre 00:00–05:00 UTC se veían como `date=N` junto a `started_at=N+1T03:30:00+00:00` — parece corrupto. | Nuevo helper `_bogota_iso_str(dt)` y reemplazado en la tab `usage`. Otras tabs no aplican (no tienen columna `date` adyacente). |
| **F6** | `actor_role TEXT NOT NULL DEFAULT 'admin'` se quedaba con DEFAULT post-backfill; `audit_log_action` tenía kwarg default `'admin'`; modelo tenía `server_default=text("'admin'")`. Triple red de seguridad silenciosa que mislabel inserts futuros que omitan `actor_role` como admin. | Mig 008 ahora ejecuta `ALTER COLUMN actor_role DROP DEFAULT` post-backfill. Eliminado `server_default` del modelo y kwarg default del service (firma ahora obliga al typechecker). Verificado: `INSERT INTO audit_logs (action) VALUES ('test')` ahora levanta `NotNullViolationError`. Los 25 call sites existentes pasan `actor_role=` explícito; sin regresiones. |
| **F7** | `MessageRepository.find_greeting` usaba `meta->>'greeting' = 'true'` (text equality) mientras el partial UNIQUE INDEX usaba `(meta->>'greeting')::boolean = true`. Predicados asimétricos → Postgres planner no usaba el índice (perf-only, correctness OK). | Resuelto junto con F8 unificando ambos a text equality. |
| **F8** | Predicado del partial UNIQUE INDEX `(meta->>'greeting')::boolean = true` rompe en cast cuando `meta.greeting` no es boolean (admin SQL, fixture rogue, futura ruta). `'yes'::boolean` levanta `invalid input syntax`. | Mig 009 + `db/schema_postgresql.sql` cambiados a `meta->>'greeting' = 'true'` text equality. Mismo predicado en `find_greeting` (F7), modelo ORM (F3), y DELETE preflight de mig 009. El planner ahora SÍ usa el índice como single-row probe y las rutas de texto rogue ya no rompen INSERTs. |

### Pass 1 (deuda técnica original, pre code-review)

Tabla original:

| # | Item | Resolución |
|---|---|---|
| **#7** | Migración Alembic formal para Evoluciones 006 (`TIMESTAMP → TIMESTAMPTZ` global), 007 (`audit_logs.admin_id → actor_id` + `actor_role` + CHECK + 2 índices nuevos, drop de `idx_audit_logs_admin_time`) y 008 (UNIQUE INDEX `uq_messages_session_greeting`, `empathy_ratings.updated_at`). El DDL ya estaba actualizado pero `alembic upgrade head` sobre BD limpia producía schema viejo. | **Resuelto**. Tres migraciones nuevas: `007_timestamptz_conversion.py`, `008_audit_logs_actor.py`, `009_greeting_unique_empathy_updated.py`. Cada una idempotente (guards sobre `information_schema` / `pg_constraint` / `IF NOT EXISTS`) — corren limpio sobre BD pre-prod ya force-updated y sobre BD vacía. Pre-flight clean-up en 009: drop de greetings duplicados (`ROW_NUMBER` partition by `session_id`) antes del UNIQUE INDEX. Validado contra BD limpia: 25/25 timestamps TZ-aware, `audit_logs` con `actor_id`/`actor_role`, 3 índices y CHECK constraint creados. |
| **#8** | `metrics_service._to_dt(d, end=True)` ancla `to_dt` a UTC, no a `America/Bogota`. Eventos creados entre 19:00 y 22:00 hora Bogotá quedan fuera del filtro "hoy" del admin. | **Resuelto**. `backend/app/services/admin/metrics_service.py`: nuevos helpers `_bogota_today`, `_to_dt` (ahora aware en `America/Bogota`), `_bogota_day_trunc`, `_bogota_week_trunc`, `_bogota_date_of`, `_bogota_date_str`. Reemplazados todos los `date.today()`, `func.date_trunc(..., col)` (8 call sites), `func.date(col)` (1 call site) y `*.date().isoformat()` en CSV export (4 call sites). Bounds y buckets ahora alineados con el calendario Bogotá; smoke test confirma `_to_dt(d, end=True)` → `23:59:59.999999-05:00`. |
| **#9** | `empathy_service.list_rated` y `get_queue` ejecutaban N+1 SELECT (`preceding_user_message` per rating). A escala de 30 estudiantes × 50 sesiones × 10 msgs = ~15k ratings la pestaña Calificadas se volvía lenta. | **Resuelto**. Nuevo helper `_batch_preceding_user_messages` en `backend/app/services/admin/empathy_service.py` usa LATERAL JOIN: una sola query devuelve el dict `{anchor_message_id → preceding_user_content}` aprovechando el índice `idx_messages_session_time`. Ambos `get_queue` y `list_rated` lo usan; `list_rated` deduplica anchors antes del fetch porque cross-rater puede repetir un message en múltiples filas. Live test contra BD: 5 anchors → 1 query (vs 5 anteriores). |
| **#10** | `chat_service.generate_greeting` descartaba el `usage_sink` (tokens consumidos) cuando perdía la carrera del UNIQUE INDEX `uq_messages_session_greeting`. | **Resuelto**. `backend/app/repositories/message_repository.py` expone `find_greeting(session_id)` (lookup vía partial UNIQUE INDEX). `chat_service.generate_greeting` ahora, en el `except IntegrityError`, hace rollback y suma `usage_sink.prompt_tokens`/`completion_tokens` al ganador via UPDATE. El dashboard refleja el costo real de generar el saludo (sin sub-reporte por StrictMode/double-clicks). |

## 11.ter Deuda técnica pendiente — Code-review 2026-05-23 (config secciones 04+05)

> **DEUDA SALDADA 2026-05-23.** Los 10 hallazgos (F1-F10) fueron arreglados
> en el mismo día. Se ejecutó un segundo code-review post-fix que detectó
> 7 hallazgos derivados, de los cuales se resolvieron los 5 más serios
> (Python 3.11 compat en `with_suffix`, F5 banner que no se mostraba con
> data stale, encapsulación de `repo._cache` via `invalidate()` público,
> log de excepción en lugar de `pass` silencioso, functional updater en
> `setInfo`). Los 2 restantes (refactor a TypedDict para `last_test`, race
> teórico de `.env` swap mid-ping) se aceptan como mejoras futuras no
> bloqueantes. Esta sección se conserva como historial — la trazabilidad
> de qué se arregló y por qué vale más que borrar el registro.

Origen: code-review automático del commit que ingresó:
- Sección 04 "Proveedor LLM" enriquecida (snapshot read-only + last_test persistido).
- Sección 05 "Estado del sistema" con chequeo real backend (DB, LLM, Piper, faster-whisper, uptime) reemplazando el "Configurado" hardcoded.
- Botones "Probar conexión" + "Volver a comprobar" restilados a outline neutral.

**Estado original:** 10 hallazgos detectados, **0 arreglados**, decisión deliberada de diferir todos para iterar contra el panel real antes de tocar arquitectura. Severidad ordenada de mayor a menor. **F1 era bloqueante para deploy** (compliance Ley 1581).
**Estado actual:** 10/10 resueltos + 5/7 derivados resueltos = panel listo para iterar más.

### F1 — D-12 commit violation en `_persist_last_test` 🔴 HIGH

- **Archivos**: `backend/app/services/admin/config_service.py:359` (commit dentro del service), `backend/app/routers/admin/config_router.py:339-365` (segundo commit del router).
- **Bug**: `_persist_last_test()` ejecuta `await self.db.commit()` directamente — el service NUNCA debe comitear según la convención D-12 documentada en el docstring del archivo. El router `test_admin_gemini` luego escribe `audit_log_action` y vuelve a comitear. Resultado: 2 commits separados. Si el segundo commit falla (DB blip, FK violation), queda el `llm_last_test` persistido sin el audit log del ping → rastro incompleto bajo Ley 1581.
- **Peor**: el `except` de `_persist_last_test` hace `await self.db.rollback()` que descarta cualquier fila pendiente ya añadida a la sesión por código previo en el request (incluyendo audit rows).
- **Fix recomendado**: `_persist_last_test` debe solo hacer la UPSERT sin commit (devolver el payload o el bool de éxito); el router comitea TODO junto (UPSERT + audit_log) en su única transacción. Patrón a seguir: igual que `update_config` que ya respeta la convención.
- **Verificar el fix**: smoke test que confirme un ping exitoso + audit_log row aparece en `/admin/logs` con `action='change_config'` y `target_type='gemini_test'`.

### F2 — GeminiSection skeleton eterno si falla `GET /admin/llm-info` 🟠 MED-HIGH

- **Archivo**: `frontend/src/pages/admin/Config.tsx:1494` (render gate).
- **Bug**: si la llamada falla en mount, `info=null` + `loadingInfo=false` → el render gate `loadingInfo || !info` cae al skeleton para siempre. El botón "Probar conexión" está dentro del `else` branch (no renderiza). Único feedback: un toast rojo que auto-dismiss en 5s.
- **Fix recomendado**: cuando `loadingInfo === false && info === null`, renderizar bloque de error con mensaje + botón "Reintentar" que invoca `loadInfo()` de nuevo. NO mantener el skeleton porque transmite "estoy cargando" mintiendo.
- **Verificación manual**: matar el backend, recargar `/admin/config`, confirmar que se ve un mensaje claro + botón.

### F3 — Triple gap en check de Piper (path relativo + concat divergente + sidecar faltante) 🟠 MEDIUM

- **Archivo**: `backend/app/services/admin/config_service.py:434` (check), `backend/app/services/tts_service.py:9` (runtime).
- **3 sub-bugs en el mismo check**:
  - **(a)** `Path("models/piper/") / "voice.onnx"` se resuelve contra `os.getcwd()`. Si uvicorn arranca desde la raíz del repo (no desde `backend/`), el `.exists()` retorna false aunque el modelo esté en `backend/models/piper/`.
  - **(b)** Runtime hace `f"{settings.PIPER_MODEL_PATH}{voice}.onnx"` con concat de strings (sin separador). Si admin pone `PIPER_MODEL_PATH=models/piper` (sin `/` final), runtime invoca `models/pipavoice.onnx` (roto) pero el health-check con `Path /` join dice OK. Divergencia silenciosa.
  - **(c)** Piper requiere TANTO `voice.onnx` COMO `voice.onnx.json` (sidecar de metadata). El check solo verifica el `.onnx`. Si el `.json` falta o se corrompió, health=OK pero TTS falla en runtime con `Piper TTS failed`.
- **Fix recomendado**: extraer un helper compartido `_piper_model_path(voice: str) -> Path` que usen tanto `tts_service` como el health check. Verificar AMBOS archivos en el check. Resolver el path con `.expanduser().resolve()` para evitar el problema de CWD.
- **Bonus**: arreglar el bug latente del runtime (string concat sin separador) en `tts_service.py:9`.

### F4 — Payload persistido en `llm_last_test` omite `model` → stale chip post .env swap 🟠 MEDIUM

- **Archivos**: `backend/app/services/admin/config_service.py:557-564` (omisión), `backend/app/schemas/admin.py:296-308` (schema `LLMLastTestInfo`), `frontend/src/pages/admin/Config.tsx:1403-1408` (interface `LLMLastTest`).
- **Bug**: el comentario justifica la omisión como "evitar drift si admin cambia .env", pero crea peor problema: admin testea modelo X (OK), 2h después cambia `LLM_MODEL` en .env y reinicia, vuelve al panel y ve "Modelo: nuevoX" + chip "Última prueba: OK · hace 2h" → asume falsamente que el nuevo modelo está validado.
- **Fix recomendado**: incluir `model` en el payload persistido + en el schema `LLMLastTestInfo` + en el frontend `LLMLastTest`. En el render, comparar `last_test.model` con `info.model`; si difieren mostrar warning visible: "Esta prueba fue contra `<old_model>`, no contra el modelo actual `<new_model>`. Vuelve a probar."
- **Sub-fix alternativo**: si se hace F1 bien (router-side commit), incluir el resultado completo en el response del POST y que el frontend lo use sin segundo roundtrip (ver F8).

### F5 — SystemStatusSection degradación silenciosa si falla `/admin/services-health` 🟠 MEDIUM

- **Archivo**: `frontend/src/pages/admin/Config.tsx:1755` (fetchHealth + render).
- **Bug**: cuando el fetch falla, `loading=false + data=null` → la tabla cae a render solo las 2 filas frontend-only (Versión + Service Worker) sin badge de error. Toast desaparece en 5s. Admin distraído ve "todo bien" cuando podría haber DB/LLM/Piper caídos. Único indicador subtle: footer text "Sin datos aún." vs timestamp normal.
- **Fix recomendado**: cuando `data === null && !loading`, renderizar banner rojo arriba de la tabla "No se pudo cargar el estado de servicios. Pulsa 'Volver a comprobar' para reintentar." y aplicar `border-danger` al SectionCard.
- **Verificación**: matar backend, refrescar página, confirmar que es imposible no notar el problema.

### F6 — `formatRelativeTime` devuelve textos negativos con clock skew 🟡 LOW

- **Archivo**: `frontend/src/pages/admin/Config.tsx:1655`.
- **Bug**: si el reloj del cliente está ≥60s adelantado vs servidor, `Date.now() - new Date(iso)` da negativo. `Math.floor(-70/60)` retorna `-2`. El branch `if (sec < 60)` matchea para sec=-70 → "hace -70 s". Para skews mayores: "hace -1 min", "hace -2 min", etc. Daña confianza en el panel.
- **Fix recomendado**: una línea al inicio: `const diffMs = Math.max(0, Date.now() - new Date(iso).getTime())`. Cero líneas adicionales.

### F7 — `_PROCESS_START_TS` resetea con uvicorn `--reload` 🟡 LOW (cosmético)

- **Archivo**: `backend/app/services/admin/config_service.py:611` (module-level), `:491` (uso en `get_services_health`).
- **Bug**: `_PROCESS_START_TS = _time.monotonic()` se captura cuando el módulo es importado. Bajo `uvicorn --reload`, WatchFiles re-importa el módulo en cada edit → `_PROCESS_START_TS` se rebinda al monotonic actual → uptime reportado es ~0 aunque el proceso lleve horas vivo. Solo en dev. Contradice el framing "tiempo real" de la sección.
- **Bonus**: el `try/except NameError` dentro del método es código muerto (el binding existe siempre tras import). Quitar.
- **Fix recomendado**: usar lifespan startup hook de FastAPI para setear `_PROCESS_START_TS` una sola vez al boot real, o `psutil.Process(os.getpid()).create_time()` para uptime real del proceso (que es independiente de re-imports).

### F8 — `runTest` descarta el response del POST y hace segundo roundtrip 🟡 LOW (UX)

- **Archivo**: `frontend/src/pages/admin/Config.tsx:1493` (`runTest`).
- **Bug**: POST `/admin/config/gemini/test` devuelve el resultado completo (ok, latency_ms, model, error). El handler lo descarta y hace un segundo GET `/admin/llm-info` para refrescar el chip. Si el segundo falla (502, red flaky), el admin ve "toast verde + toast rojo" simultáneos y el chip sigue stale.
- **Fix recomendado** (2 opciones):
  - **A** (frontend): usar la response del POST inmediatamente para hidratar local last_test (optimistic update), llamar loadInfo en background sin bloquear.
  - **B** (backend): cambiar el response del POST para devolver `LLMInfoResponse` completo (1 sola roundtrip). Más limpio.

### F9 — `_mask_api_key` revela demasiado para keys cortas 🟢 LOW (defensive)

- **Archivo**: `backend/app/services/admin/config_service.py:312`.
- **Bug**: `raw[-4:]` siempre toma 4 chars. Para keys de 5-11 chars (placeholders de test, fixtures locales), expone 4 chars de un total de 5-11. Para una key real de Gemini (~39 chars), expone 4/39 ≈ 10% — aceptable. Para `LLM_API_KEY=test1` (placeholder), expone 80%.
- **Fix recomendado**: `if len(raw) < 12: return "●●●●●●", True` (mirroring AWS/Stripe console convention).

### F10 — `_persist_last_test` UPSERT bypasses `repo._cache` invalidation 🟢 LOW (latente)

- **Archivo**: `backend/app/services/admin/config_service.py:351` (UPSERT via raw SQL).
- **Bug**: la UPSERT raw bypassea `SystemConfigRepository.update_value` que invalida su `_cache`. Hoy benigno porque ningún caller re-lee `llm_last_test` en el mismo request, pero si un refactor futuro hace `repo.get_value('llm_last_test')` después del ping, retornará el valor pre-UPSERT cacheado.
- **Fix recomendado**: una línea tras la UPSERT — `self.repo._cache = None` (mismo patrón que `update_value`).

---

### Cómo retomar esta deuda

Cuando vuelvas a abordar estos hallazgos:

1. **Empezar SIEMPRE por F1** — es bloqueante de compliance + base para F4 (si F1 se hace bien, el router puede devolver el resultado completo y F4/F8 se simplifican).
2. **F2 + F5** (recovery UI) — patrón compartido; resolverlos juntos.
3. **F3** (Piper) — requiere tocar `tts_service.py` también, salir de Config si querés cerrar el ciclo.
4. **F6, F7, F9, F10** — fixes de 1-5 líneas cada uno; agruparlos en un single "polish commit".

Validación post-fix: re-ejecutar el code-review skill sobre los archivos tocados para confirmar que no se introducen regresiones nuevas.

## 12. Reglas de negocio cruzadas

### 12.1 Privacidad

| Principio | Aplicación |
|---|---|
| **D-03**: nunca exponer `messages.content` | Endpoints admin omiten `content`. Reportes solo muestran metadata + `details` libre del estudiante. |
| **L2**: ocultar `message_id` en frontend | Donde se muestre payload, `REDACTED_KEYS = ['message_id']` lo enmascara. BD lo conserva 30 días para forensics, después un cron lo redacta del payload (`backend/scripts/redact_old_message_ids.py`, ver `docs/DATA_RETENTION_POLICY.md` §10). |
| **D-08**: anonimizar IDs en CSV | Toda exportación CSV pasa por `sha256(value)[:16]` en columnas id-like. |
| **D-14**: hard DELETE de usuarios | `safety_events.user_id` con `ON DELETE SET NULL` preserva eventos anónimos. |

### 12.2 Auditoría

Acciones que generan entrada en `audit_logs` (ver § 10.2 para el catálogo completo y `details` esperado):

- **Admin** (originadas en el panel): `login`, `view_user`, `disable_user`, `enable_user`, `update_cohort`, `change_config`/`update_system_config`, `review_report`, `review_safety_event`, `export_data`, `empathy_rate`.
- **Estudiante** (originadas por el propio usuario): `user_register`, `user_login`, `user_delete`, `consent_granted`, `consent_revoked`, `password_reset_requested`, `password_reset_completed`.
- **Sistema** (sin actor humano): `user_login_failed`.

Captura común: `actor_id`, `actor_role`, `action`, `target_type`, `target_id`, `detail` (JSON), `ip_address`, `created_at`.

`audit_logs` es bitácora; los datos sustantivos viven en sus tablas naturales y se referencian vía `target_id` (ver § 10.5).

### 12.3 Identidad del LLM

- Mabel IA es la única identidad expuesta al usuario.
- Nunca exponer `Google` / `Gemini` en logs visibles, payloads, o UI. El `meta.model` de `messages` guarda `settings.GEMINI_MODEL` (nombre técnico del modelo, no proveedor).
- Excepción: `gemini_cost_estimate_usd` está en el dominio interno técnico/admin — visible en `/admin/metrics` pero etiquetado como "Costo LLM" (no "Costo Gemini") en UI.

### 12.4 Timezone

- BD: todas las columnas temporales son `TIMESTAMP WITH TIME ZONE` (Evolución 006).
- Backend: usa `datetime.now(UTC)` (aware) consistentemente.
- Frontend: `formatDateTick` en `chartTheme.ts` parsea `YYYY-MM-DD` como fecha local para que "22-may" no aparezca como "21-may" en zona Bogotá (UTC-5).

### 12.5 Consent-scope eligibility (research vs operacional)

El campo `consents.scope` (`solo_uso` | `uso_mejora_anon`) dejó de ser decorativo: define qué datos entran a las superficies de investigación. Single source of truth: `backend/app/services/consent_eligibility.py` (`get_research_eligible_user_ids`).

**Regla:** un usuario es research-eligible si su última fila no-revocada en `consents` tiene `scope = 'uso_mejora_anon'`. NO se exige que esa fila pertenezca a la `consent_version` activa actual — así, publicar una nueva versión no vacía el dashboard mientras los usuarios re-aceptan.

#### Matriz de qué se filtra

| Superficie | Endpoint / método | Filtrado por scope |
|---|---|---|
| `metrics_usage` (Tab A) | `AdminMetricsService.metrics_usage` | Sí |
| `metrics_wellbeing` (Tab B) | `AdminMetricsService.metrics_wellbeing` | Sí |
| `metrics_technical` (Tab C) | `AdminMetricsService.metrics_technical` | Sí |
| `metrics_safety.infraction_rate` (Tab D) | parcial | Sí (research) |
| `metrics_safety.top_keywords` (Tab D) | parcial | Sí (research) |
| `metrics_safety.safety_events_per_day` (Tab D) | parcial | **No** (operacional — safety triage) |
| `metrics_safety.guardrails_type_distribution` (Tab D) | parcial | **No** (operacional — safety triage) |
| `metrics_study` (Tab E) | `AdminMetricsService.metrics_study` | Sí (vía `_sus_scores`, `_wellbeing_pair_data` y empathy_repo.stats con eligible_user_ids) |
| `export_csv` (todas las tabs) | `AdminMetricsService.export_csv` | Sí |
| `dashboard.sessions_per_day_30d` | `_sessions_per_day` | Sí |
| `dashboard.mood_distribution_30d` | `_mood_distribution` | Sí |
| `dashboard.latency_per_day_30d` | `_latency_per_day` | Sí |
| `dashboard.sus_avg` | `_sus_scores` | Sí |
| `dashboard.total_users` | inline | **No** (operacional) |
| `dashboard.users_new_this_week` | inline | **No** (operacional) |
| `dashboard.sessions_today` | inline | **No** (operacional) |
| `dashboard.safety_events_24h` | inline | **No** (legal/safety) |
| `dashboard.safety_events_active` | inline | **No** (legal/safety) |
| `dashboard.reports_pending` | inline | **No** (legal/safety) |
| `dashboard.latency_avg_ms` | inline | **No** (SLA operacional) |
| `dashboard.safety_events_by_type_30d` | `_safety_events_by_type` | **No** (safety triage) |
| `dashboard.guardrails_activations_14d` | `_guardrails_per_day` | **No** (safety triage) |
| `dashboard.last_5_safety_events` | inline | **No** (safety triage) |
| Empathy queue (cola) | `AdminEmpathyService.get_queue` | Sí |
| Empathy lista calificadas | `AdminEmpathyService.list_rated` | Sí |
| Empathy stats agregadas | `AdminEmpathyService.get_stats` → repo.stats | Sí |
| `audit_logs` admin filter | `AuditLogsService.list` | **No** (legal — siempre todos) |
| `safety_events` admin filter | `AdminSafetyEventsService.list` | **No** (legal — siempre todos) |
| `message_reports` admin filter | `AdminReportsService.list` | **No** (legal — siempre todos) |
| Chat del propio usuario | `chat_service.send_message` etc. | **No** (es su sesión — consent gobierna análisis, no entrega) |

**Comportamiento al publicar nueva consent_version:**
- Usuarios con consent v1.0 activo siguen contribuyendo bajo su scope previo hasta que re-aceptan.
- Re-aceptar con un scope distinto cambia su elegibilidad inmediatamente.
- Revocar quita inmediatamente al usuario de todas las superficies research.

---

*Documento vivo. Cada sección se expande al validarse contra BD y mockups.*
