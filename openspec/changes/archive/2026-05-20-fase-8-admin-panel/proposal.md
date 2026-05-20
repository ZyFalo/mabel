## Why

Mabel IA tiene completas las HUs de estudiante (Fases 1-7, hito pilotable). Falta el lado administrativo para gestionar el estudio cuasiexperimental con 30 estudiantes UMB: panel de metricas (criterios de exito), triaje de reportes y safety events, gestion de usuarios, configuracion operativa (system_config) y trazabilidad legal (audit_logs Ley 1581/2012). Sin Fase 8 el equipo investigador no puede operar el piloto.

## What Changes

Implementar 8 interfaces admin y ~40 endpoints `/admin/*`:

- **#24 Dashboard Admin** (`/admin`) — KPIs en tiempo real + 5 graficas de tendencia
- **#25 Safety Events** (`/admin/safety-events`) — tabla paginada, filtros, cambio de estado
- **#26 Reportes Triaje** (`/admin/reports`) — ciclo open/triaged/resolved/dismissed
- **#27 Metricas Investigacion** (`/admin/metrics`) — 5 tabs: Uso, Bienestar, Tecnicas, Seguridad, Estudio (SUS/empatia)
- **#28 Listado Usuarios** (`/admin/users`) — buscador, filtros, paginacion
- **#29 Detalle Usuario** (`/admin/users/:id`) — datos agregados + desactivar
- **#30 System Config** (`/admin/config`) — consent_versions, guardrails keywords, SOS hotlines
- **#31 Audit Logs** (`/admin/logs`) — registro inmutable Ley 1581/2012
- **#34 Sidebar Admin** — navegacion lateral con badges

Tambien: login redirige por rol (admin → `/admin`), middleware de audit-log automatico para acciones admin, exportacion CSV anonimizada.

## Capabilities

### New Capabilities

- `admin-foundation` — backend `require_admin` + `audit_log_action()` utility + login redirect por rol; frontend `AdminLayout`, `AdminSidebar` (#34), rutas `/admin/*`, componentes compartidos (DataTable, Pagination, FilterBar, MetricCard, ExportCsvButton)
- `admin-users` — backend `/admin/users`, `/admin/users/:id`, `/admin/users/:id/disable`; frontend #28 + #29
- `admin-reports-safety` — backend `/admin/reports`, `/admin/safety-events` (GET con filtros + PATCH estado + CSV); frontend #25 + #26
- `admin-metrics` — backend `/admin/dashboard`, `/admin/metrics/{usage|wellbeing|technical|safety|study}`, `/admin/metrics/export`; frontend #24 + #27 con Recharts
- `admin-config-audit` — backend extension `system_config` (consent versions, keywords, SOS hotlines, Gemini test) + `/admin/logs`; frontend #30 + #31

### Modified Capabilities

- `backend-scaffold` — registrar 6 nuevos routers admin en `main.py`
- `frontend-shell` — extender `App.tsx` con rutas `/admin/*` + RoleGuard, Login con redirect por rol

## Impact

- **Backend**: 6 routers nuevos (~40 endpoints), 5 services admin, 2 repos nuevos (AuditLogRepository, SurveyResponseRepository), middleware `audit_log_action`, schemas Pydantic admin
- **Frontend**: 8 paginas nuevas, AdminLayout + AdminSidebar, ~6 componentes compartidos, `adminStore.ts`, +1 dependencia (`recharts`)
- **BD**: Sin cambios de schema. Usa tablas existentes (users, audit_logs, safety_events, message_reports, system_config, survey_responses, sessions, messages)
- **Migraciones**: Ninguna
- **Privacidad/Legal**: Admin NUNCA ve `messages.content`. Emails parcialmente enmascarados. Todas las acciones admin registradas en `audit_logs`. CSV export anonimiza user_ids (hash) y oculta emails.
