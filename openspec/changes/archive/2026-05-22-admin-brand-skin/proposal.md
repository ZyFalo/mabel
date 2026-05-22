# admin-brand-skin

## Why

El estudiante ya migró a la piel del prototipo Mabel (OpenSpec `mabel-brand-skin`, archivado). El admin sigue en el diseño v1 (header rojo 56px + sidebar plano + cards genéricas) y arrastra dos problemas:

1. **Regresión visual**: el cambio de `--color-accent` (teal → mabel red) en `mabel-brand-skin` colapsó el contraste del header+sidebar del admin (ambos rojos), porque `AdminSidebar.tsx` usa `bg-accent`. El branding se fusiona y los pills "Admin · Mabel Admin · Salir" pierden legibilidad.
2. **Inconsistencia de marca**: con dos personas (estudiante / admin) en la misma app, mantener dos lenguajes visuales fragmenta la identidad Mabel.

**Decisión de PO**: unificar admin con la línea brand-skin. Replicar densidad operativa (tablas, métricas, filtros) sobre la paleta + tipografía + tokens del prototipo.

**Regla preservada**: cero pérdida funcional. D-03 (admin nunca ve `messages.content`), D-05 (login redirect por rol), masking de emails `e***@est.umb.edu.co`, anonimización CSV `sha256(value)[:16]`, AdminGuard route protection, audit_log de toda acción admin — todo intacto.

## What Changes

Aplicar la piel brand-skin sobre el panel admin manteniendo su rol operativo:

- **Layout admin** (`AdminLayout` + `AdminSidebar` + `Header`): reskin con paleta brand (`--mabel-*`, `--ink-*`), tipografía Nunito, sidebar 220px con grupos lógicos (Operación / Datos / Sistema), header limpio con breadcrumb + user pill estilo brand
- **Dashboard ejecutivo**: 7 MetricCard reskin (warm cards, shadow-brand, tipografía display), gráficos Recharts con paleta brand, vigilancia compacta
- **Tablas operativas** (`SafetyEvents`, `Reports`, `Users`, `EmpathyRatings`, `AuditLogs`): rows con hover ink-50, badges con paleta semántica brand, filtros como pills, paginación brand
- **Detalle usuario** (`UserDetail`): hero band con email masked + role pill, tabs internos
- **Métricas** (`Metrics`): tabs A-E con cards brand, charts paleta brand
- **Configuración** (`Config`): cards brand, toggles brand-styled
- **Modales** (`DisableUserModal`): backdrop brand, card centered con header band
- **Componentes compartidos** (`MetricCard`, `ExportCsvButton`): reskin tokens brand
- **Tildes**: corrección ortográfica completa (Configuración, Métricas, Calificación Empatía, últimos, días, Distribución de ánimo, Sesiones por día, etc.)

## Capabilities

### Modified Capability: `admin-ui`

Reskin completo del panel admin sobre la paleta brand-skin, preservando 100% de funcionalidad documentada en `2026-05-20-fase-8-admin-panel` y `2026-05-20-fase-8.1-research-instrumentation`.

## Impact

- **Frontend**: ~16 archivos modificados (2 layouts + 9 páginas + 3 componentes shared + 1 modal + index.css token restoration)
- **Backend**: CERO cambios. Endpoints `/admin/*` intactos
- **BD**: CERO migraciones
- **Funcionalidad preservada**: AdminGuard, D-03 (sin messages.content), D-05 (role redirect), email masking, CSV anonimización sha256(value)[:16], audit_log_action en TODAS las mutaciones admin, paginación, filtros, export CSV, modales (DisableUser), tabs Metrics A-E, EmpathyRatings con criteria JSONB
- **Estudiante**: INTACTO. Solo cambia el lado admin.
- **--color-accent** se restaura a teal `#0F303A` solo si algún componente legacy aún lo usa; preferible eliminar la dependencia.

## Out of Scope

- Nuevas funcionalidades admin (Fase 8.2+)
- Cambios en endpoints o esquema de BD
- Avatar 3D / lip-sync (Fase 9)
- Cambios al estudiante (ya tiene su brand-skin)
