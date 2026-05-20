## Design Decisions

### D-01: Recharts como libreria de graficas

**Decision:** Usar `recharts` (lib React declarativa basada en SVG/D3) para todas las graficas del dashboard #24 y metricas #27.

**Rationale:** Confirmado en Notion (Sistema de Agentes D-04). API declarativa simple, integracion natural con React, sin canvas. Soporta line, bar, area, pie/donut. Tamano bundle aceptable.

### D-02: Middleware/utility de audit-log automatico

**Decision:** Crear `audit_log_action(admin_id, action, target_type, target_id, details)` como utility en `app/services/audit_service.py` que cada endpoint admin llama explicitamente. NO usar decorador automatico para mantener control sobre `details` (JSONB con contexto especifico).

**Rationale:** Ley 1581/2012 requiere logs inmutables de acceso a datos. Llamada explicita garantiza que `details` capture el contexto especifico de cada accion (filtros usados, user objetivo, etc.). Decorador generico tenderia a logs poco informativos. AuditLog ya tiene `ON DELETE SET NULL` sobre `admin_id` para preservar trazabilidad.

### D-03: Privacidad — admin NUNCA ve contenido de mensajes

**Decision:** Endpoints admin retornan SOLO metadatos. `messages.content` jamas se serializa en respuestas admin. Reportes muestran `motivo`, `severidad`, `reporter_id` (truncado UUID) — no el mensaje reportado. Safety events muestran `payload` (que ya excluye content por diseno) — no el mensaje que disparo.

**Rationale:** Constraint funcional explicito en Notion (#25, #26, #28, #29). Cumple Ley 1581/2012 (minimizacion de exposicion de datos personales). El estudio cuasiexperimental analiza patrones agregados, no contenido individual.

### D-04: Enmascaramiento de emails en vistas admin

**Decision:** Emails se enmascaran a `e***@est.umb.edu.co` (primera letra + dominio) en todas las tablas admin. La unica excepcion: detalle de usuario (#29) muestra email parcialmente enmascarado pero permite identificar al usuario para acciones puntuales.

**Rationale:** Reduce exposicion accidental. El admin igual puede identificar usuarios via UUID truncado + estadisticas + fecha registro.

### D-05: Login redirect por rol

**Decision:** Frontend `Login.handleSubmit` lee `response.user.role` y navega: `student` → `/home`, `admin` → `/admin`. No se crea ruta `/login-admin` separada (Notion #23 lo confirma).

**Rationale:** Backend no cambia. JWT ya incluye claim `role`. Una sola ruta de login es mas simple y refleja la realidad (el admin es un usuario con rol distinto).

### D-06: Metricas #27 como una sola pagina con tabs internos

**Decision:** `AdminMetrics.tsx` es un componente unico con state `activeTab: 'usage' | 'wellbeing' | 'technical' | 'safety' | 'study'`. URL queda `/admin/metrics?tab=usage` (query param). No se crean rutas hijas separadas.

**Rationale:** Notion #27 documenta los 5 tabs como sub-tabs de una interfaz, no como interfaces independientes. URL con query param permite linkear directamente a un tab sin perder el pattern.

### D-07: Paginacion estandar

**Decision:** Todos los endpoints admin tipo lista retornan `{items: [], total: int, page: int, page_size: int}`. Default `page_size=20`, max `100`. Query params `?page=1&page_size=20`.

**Rationale:** Predictible. Soporta tablas con paginacion server-side. Evita escaneos completos en tablas grandes (safety_events, audit_logs).

### D-08: CSV export anonimizado

**Decision:** Endpoint `/admin/metrics/export` (y endpoints CSV de #25, #26) generan CSV con: `user_id` reemplazado por `SHA-256(user_id)[:16]` (hash truncado), `email` excluido, `content` excluido. Streamen via `StreamingResponse` `text/csv`.

**Rationale:** Anonimizacion irreversible para uso en SPSS/R/Python externo. Cumple Resolucion 8430/1993 (investigacion con minimo riesgo).

### D-09: KPIs en tiempo real via polling (no WebSockets)

**Decision:** Dashboard #24 hace polling cada 30s a `/admin/dashboard` para refrescar KPIs. No se introduce WebSockets en el MVP.

**Rationale:** Simplicidad. El piloto tiene 30 usuarios y carga baja. Polling es suficiente. WebSockets se evalua post-MVP si la carga lo justifica.

### D-10: HU mapping clarificacion

**Decision:** HUs de Fase 8 son HU-15 (gestion usuarios admin), HU-16 (triaje reportes), HU-17 (metricas + config admin). Las HUs de Fase 3 (reportes estudiante) son HU-14 + lectura de reportes propios.

**Rationale:** El Flujo de Implementacion en Notion menciona HU-15/16/17 para Fase 8 pero no las define con detalle. Las desambiguo en favor del scope admin. Si el PO indica otro mapping lo ajusto.

### D-11: Aggregation queries — SQLAlchemy raw + funciones agregadas

**Decision:** Endpoints de metricas usan `select(func.count(...), func.avg(...))` con `group_by` (date_trunc) directamente sobre las tablas. No se cachean resultados ni se introducen tablas materializadas en el MVP.

**Rationale:** Tablas pequenas (30 usuarios x 90 dias). PostgreSQL responde en ms. Optimizacion premature.

### D-12: Audit log se escribe ANTES del commit de la accion

**Decision:** En cada endpoint admin: (1) realizar la accion (PATCH user, etc.), (2) `audit_log_action()`, (3) commit unico al final. Si la accion falla, el log no se escribe (transaccion atomica).

**Rationale:** Atomicidad. No queremos logs de acciones que rollback hicieron.

### D-13: Estructura de archivos backend

- `backend/app/routers/admin/__init__.py` (incluye sub-routers)
- `backend/app/routers/admin/users_router.py`
- `backend/app/routers/admin/reports_router.py`
- `backend/app/routers/admin/safety_events_router.py`
- `backend/app/routers/admin/metrics_router.py`
- `backend/app/routers/admin/config_router.py`
- `backend/app/routers/admin/audit_logs_router.py`
- `backend/app/routers/admin/dashboard_router.py`
- `backend/app/services/admin/users_service.py`
- `backend/app/services/admin/metrics_service.py`
- `backend/app/services/audit_service.py` (utility `audit_log_action`)
- `backend/app/repositories/audit_log_repository.py` (nuevo)
- `backend/app/repositories/survey_response_repository.py` (nuevo)
- `backend/app/schemas/admin.py`

### D-14: Estructura de archivos frontend

- `frontend/src/pages/admin/Dashboard.tsx` (#24)
- `frontend/src/pages/admin/Users.tsx` (#28)
- `frontend/src/pages/admin/UserDetail.tsx` (#29)
- `frontend/src/pages/admin/Reports.tsx` (#26)
- `frontend/src/pages/admin/SafetyEvents.tsx` (#25)
- `frontend/src/pages/admin/Metrics.tsx` (#27, con 5 tabs internos)
- `frontend/src/pages/admin/Config.tsx` (#30)
- `frontend/src/pages/admin/AuditLogs.tsx` (#31)
- `frontend/src/components/admin/AdminLayout.tsx`
- `frontend/src/components/admin/AdminSidebar.tsx` (#34)
- `frontend/src/components/admin/DataTable.tsx` (generico)
- `frontend/src/components/admin/Pagination.tsx`
- `frontend/src/components/admin/FilterBar.tsx`
- `frontend/src/components/admin/MetricCard.tsx`
- `frontend/src/components/admin/ExportCsvButton.tsx`
- `frontend/src/components/admin/charts/` (wrappers de Recharts)
- `frontend/src/stores/adminStore.ts` (notificaciones / badges)
