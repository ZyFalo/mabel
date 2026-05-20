## Tasks

### Capability 1 — admin-foundation

#### Backend

- [x] 1. Add `require_admin` alias to `app/middleware/auth.py` (`require_admin = require_role("admin")`)
- [x] 2. Create `app/repositories/audit_log_repository.py` with `create()` and `list_with_filters()` methods (paginated)
- [x] 3. Create `app/repositories/survey_response_repository.py` with `list_by_filters()` and aggregation helpers
- [x] 4. Create `app/services/audit_service.py` with `async def audit_log_action(db, admin_id, action, target_type, target_id, details, ip=None)` utility
- [x] 5. Create `app/schemas/admin.py` — base DTOs: `PaginatedResponse[T]`, `UserAdminListItem`, `UserAdminDetail`, `ReportAdminItem`, `SafetyEventAdminItem`, `AuditLogItem`, etc.

#### Frontend

- [x] 6. Create `frontend/src/components/admin/AdminLayout.tsx` (mirrors `StudentLayout` structure)
- [x] 7. Create `frontend/src/components/admin/AdminSidebar.tsx` — 7 links + active highlight + badge slot
- [x] 8. Create `frontend/src/components/admin/DataTable.tsx` — generic with sortable columns, expandable rows, render-prop for actions
- [x] 9. Create `frontend/src/components/admin/Pagination.tsx`
- [x] 10. Create `frontend/src/components/admin/FilterBar.tsx`
- [x] 11. Create `frontend/src/components/admin/MetricCard.tsx` — label + value + threshold color + optional trend
- [x] 12. Create `frontend/src/components/admin/ExportCsvButton.tsx` — handles `apiClient.get` with `responseType:'blob'` + download trigger
- [x] 13. Create `frontend/src/stores/adminStore.ts` — holds `pendingReports`, `activeSafetyEvents` for sidebar badges; polls every 60s while on `/admin/*`
- [x] 14. Update `frontend/src/pages/Login.tsx` `handleSubmit` to redirect by `user.role`
- [x] 15. Update `frontend/src/App.tsx` to register `/admin/*` routes wrapped in `RoleGuard role="admin"` + `AdminLayout` outlet

### Capability 2 — admin-users

#### Backend

- [ ] 16. Create `app/routers/admin/__init__.py` (empty marker)
- [ ] 17. Create `app/services/admin/users_service.py` with `list_users(filters, page, page_size)`, `get_user_detail(id)`, `disable_user(id, reason)`. Compute `consent_status` and stats via joins.
- [ ] 18. Create `app/routers/admin/users_router.py` with GET `/admin/users`, GET `/admin/users/:id`, PATCH `/admin/users/:id/disable`. Use `require_admin`. Mask emails (`{first_char}***@{domain}`). Call `audit_log_action` for view_user / disable_user.

#### Frontend

- [ ] 19. Create `frontend/src/pages/admin/Users.tsx` (#28) — FilterBar + DataTable + Pagination
- [ ] 20. Create `frontend/src/pages/admin/UserDetail.tsx` (#29) — 4 sections + Deshabilitar button
- [ ] 21. Create `frontend/src/components/admin/DisableUserModal.tsx` — textarea con validacion min 10 chars

### Capability 3 — admin-reports-safety

#### Backend

- [ ] 22. Create `app/routers/admin/reports_router.py` with GET `/admin/reports`, PATCH `/admin/reports/:id`, GET `/admin/reports/export.csv`. Enforce state transitions. Use `require_admin`. Never return `messages.content`.
- [ ] 23. Create `app/routers/admin/safety_events_router.py` with GET `/admin/safety-events`, PATCH `/admin/safety-events/:id`, GET `/admin/safety-events/export.csv`. Use `require_admin`. Anonymize via SHA-256 truncated hashes in CSV.
- [ ] 24. Extend `MessageReportRepository` with `list_with_filters()` and `update_status()` if missing
- [ ] 25. Extend `SafetyEventRepository` with `list_with_filters()` and `update_status()` if missing

#### Frontend

- [ ] 26. Create `frontend/src/pages/admin/Reports.tsx` (#26) — indicadores + FilterBar + DataTable con expandable rows + state buttons + ExportCsvButton
- [ ] 27. Create `frontend/src/pages/admin/SafetyEvents.tsx` (#25) — FilterBar + DataTable con expandable rows mostrando payload JSON formateado + state buttons + ExportCsvButton

### Capability 4 — admin-metrics

#### Backend

- [ ] 28. Create `app/services/admin/metrics_service.py` with aggregation methods: `dashboard_kpis()`, `metrics_usage(from,to)`, `metrics_wellbeing(from,to)`, `metrics_technical(from,to)`, `metrics_safety(from,to)`, `metrics_study(from,to)`. Use SQLAlchemy `func.count/avg/percentile_cont` + `date_trunc`.
- [ ] 29. Create `app/routers/admin/metrics_router.py` with GET `/admin/dashboard`, GET `/admin/metrics/{usage|wellbeing|technical|safety|study}`, GET `/admin/metrics/export.csv?tab=...`
- [ ] 30. Implement Gemini cost estimation in `metrics_service.metrics_technical` (use cached rate per million tokens)
- [ ] 31. Implement Cohen's d and t-test in `metrics_service.metrics_study` using `survey_responses` pre/post pairs

#### Frontend

- [ ] 32. Install `recharts` (`npm i recharts`) and add types
- [ ] 33. Create `frontend/src/components/admin/charts/LineChartWrapper.tsx`, `BarChartWrapper.tsx`, `DonutChartWrapper.tsx`, `MetricLineWithReference.tsx`
- [ ] 34. Create `frontend/src/pages/admin/Dashboard.tsx` (#24) — 7 KPI cards (con thresholds) + 4 line/bar charts + 1 donut + last-5 safety events mini-tabla + polling 30s
- [ ] 35. Create `frontend/src/pages/admin/Metrics.tsx` (#27) — 5 tabs internos sincronizados con `?tab=`, controles globales (date range, refresh, export), un componente por tab

### Capability 5 — admin-config-audit

#### Backend

- [ ] 36. Extend `SystemConfigRepository` with `update_value(key, value)` if missing; extend service with validation helpers
- [ ] 37. Create `app/routers/admin/config_router.py` with GET `/admin/config`, PATCH `/admin/config/:key`, POST `/admin/consent-versions`, POST `/admin/consent-versions/:id/publish`, POST `/admin/config/gemini/test`. Per-key validation. Audit log every change.
- [ ] 38. Create `app/routers/admin/audit_logs_router.py` with GET `/admin/logs`, GET `/admin/logs/export.csv`. Append-only — no PATCH/DELETE.
- [ ] 39. Register all 6 admin routers in `app/main.py`

#### Frontend

- [ ] 40. Create `frontend/src/pages/admin/Config.tsx` (#30) — 5 secciones (Consentimiento, Guardrails, SOS hotlines, Gemini, Estado sistema). Cada edicion va a PATCH `/admin/config/:key`. Test Gemini button.
- [ ] 41. Create `frontend/src/pages/admin/AuditLogs.tsx` (#31) — FilterBar + DataTable con expandable rows mostrando `details` JSON + ExportCsvButton

### Verification & polish

- [ ] 42. Backend: ensure `messages.content` is never serialized in any admin response (grep audit + add unit test if pytest is set up)
- [ ] 43. Verify all admin pages render under `AdminLayout` and sidebar badges update via `adminStore` polling
- [ ] 44. Run `npx tsc --noEmit` (frontend) and verify backend imports (`python -c "from app.main import app"`) without errors
- [ ] 45. Manual smoke test on `http://localhost:5173` with admin account: login redirect → dashboard KPIs → navigate each section → exercise filters → disable a test user → export CSV → verify audit_logs row
