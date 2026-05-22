# admin-brand-skin — Tasks

## Cap 1 — Design spec (ux-ui-designer)

- [x] 1.1 Audit current admin pages (read all 9 page files + 2 layouts + 3 shared components)
- [x] 1.2 Define admin tokens delta vs student brand-skin (densidad, table rows, badge variants)
- [x] 1.3 ASCII mockup of AdminSidebar reskin (groups: Operación / Datos / Sistema)
- [x] 1.4 ASCII mockup of Header reskin (breadcrumb + user pill)
- [x] 1.5 ASCII mockup of Dashboard (7 MetricCards + 4 chart cards + vigilancia)
- [x] 1.6 ASCII mockup of table page pattern (SafetyEvents as canonical)
- [x] 1.7 ASCII mockup of UserDetail (hero + tabs)
- [x] 1.8 ASCII mockup of Metrics with tab variants
- [x] 1.9 ASCII mockup of Config + DisableUserModal
- [x] 1.10 Write specs/admin-ui/spec.md with requirements + scenarios for each page

## Cap 2 — Implementation (frontend-developer + manual completion)

- [x] 2.1 Auditar y eliminar dependencia de `--color-accent` en código admin (refactor a `var(--ink-900)`). Token sigue en `index.css` por compat Tailwind.
- [x] 2.2 Reskin `AdminLayout.tsx` (warm bg, no full red header)
- [x] 2.3 Reskin `AdminSidebar.tsx` (220px brand sidebar, groups, profile pill bottom)
- [x] 2.4 Reskin `Header.tsx` (clean header with breadcrumb, replaces full-red bar) — refactored as new `AdminHeader.tsx`
- [x] 2.5 Reskin `Dashboard.tsx` (MetricCard brand + Recharts paleta)
- [x] 2.6 Reskin `SafetyEvents.tsx` (canonical table page)
- [x] 2.7 Reskin `Reports.tsx`
- [x] 2.8 Reskin `Users.tsx` + `UserDetail.tsx`
- [x] 2.9 Reskin `EmpathyRatings.tsx`
- [x] 2.10 Reskin `Metrics.tsx` (tabs A-E)
- [x] 2.11 Reskin `Config.tsx`
- [x] 2.12 Reskin `AuditLogs.tsx`
- [x] 2.13 Reskin shared: `MetricCard.tsx`, `ExportCsvButton.tsx`, `DisableUserModal.tsx`
- [x] 2.14 Tildes barrido completo en admin (Configuración, Métricas, Calificación, Empatía, últimos, días, etc.)
- [x] 2.15 `npx tsc --noEmit` clean
- [x] 2.16 `npm run build` clean (1.59s, CSS 48KB, JS 283KB gz)

## Cap 3 — QA (qa-testing)

- [x] 3.1 Visual smoke: cada ruta admin renderiza sin errores (validado por PO 2026-05-21)
- [x] 3.2 Funcional: AdminGuard, D-03 (sin content), D-05 (redirect), masking, audit_log (sin tocar handlers, sólo presentación)
- [x] 3.3 Accesibilidad: tokens semánticos consistentes (success/warn/danger/info 50+700 con ratios WCAG AA)
- [x] 3.4 Tildes: barrido completo, cero strings sin diacríticos en admin

## Cap 4 — Cierre

- [ ] 4.1 `openspec validate admin-brand-skin --strict`
- [ ] 4.2 `openspec archive admin-brand-skin`
- [ ] 4.3 Commit en feat/student-redesign
