## ADDED Requirements

### Requirement: Admin role authorization

The backend SHALL provide a `require_admin` dependency that is an alias for `require_role("admin")`. All admin endpoints SHALL use this dependency. The dependency SHALL return 403 with body `{"detail": "Acceso denegado"}` for non-admin users.

#### Scenario: Student blocked from admin endpoint

Given an authenticated student with valid JWT
When the student requests any `/admin/*` endpoint
Then the response SHALL be 403 with `{"detail": "Acceso denegado"}`

#### Scenario: Admin authorized

Given an authenticated admin with valid JWT
When the admin requests any `/admin/*` endpoint
Then the request SHALL proceed past authorization

### Requirement: Audit log utility

The backend SHALL provide `audit_log_action(db, admin_id, action, target_type, target_id, details)` in `app/services/audit_service.py`. The utility SHALL insert a row into `audit_logs` with `created_at = now()`. The `action` parameter SHALL be one of: `login`, `view_user`, `disable_user`, `change_config`, `review_report`, `review_safety_event`, `export_data`. The utility SHALL NOT commit (caller responsible).

#### Scenario: Audit log created

Given an admin performs `disable_user` action
When the endpoint calls `audit_log_action(db, admin.id, "disable_user", "user", target_user.id, {"reason": "..."})`
Then an `audit_logs` row SHALL be inserted with all fields populated

### Requirement: Login redirects by role

The frontend `Login.tsx` SHALL inspect `user.role` from the login response. If `role == "admin"` it SHALL navigate to `/admin`. If `role == "student"` it SHALL follow the existing flow (consent check then `/home`). Backend does NOT change.

#### Scenario: Admin redirected to /admin

Given an admin submits valid credentials at `/login`
When the login response returns `{user: {role: "admin", ...}, token: "..."}`
Then the frontend SHALL navigate to `/admin`

### Requirement: AdminLayout and AdminSidebar

The frontend SHALL provide `AdminLayout` (analogous to `StudentLayout`) and `AdminSidebar` (#34) components. The sidebar SHALL render 7 navigation links: Dashboard (`/admin`), Safety Events (`/admin/safety-events`), Reportes (`/admin/reports`), Metricas (`/admin/metrics`), Usuarios (`/admin/users`), Configuracion (`/admin/config`), Logs (`/admin/logs`). Two of the links (Safety Events, Reportes) SHALL display a red badge if there are pending items (active safety_events count, open reports count). The active link SHALL be visually highlighted.

#### Scenario: Sidebar renders all links

Given an admin is on any `/admin/*` page
When the AdminSidebar renders
Then all 7 links SHALL be visible
And the link matching the current route SHALL be highlighted

#### Scenario: Badge shows pending count

Given there are open safety events
When the sidebar loads
Then the Safety Events link SHALL display a red badge with the count

### Requirement: Shared admin components

The frontend SHALL provide reusable admin components in `components/admin/`:
- `DataTable` — sortable columns, expandable rows, slot for row actions
- `Pagination` — page selector, page size selector (10/20/50), total counter
- `FilterBar` — flexible filter container with reset button
- `MetricCard` — large KPI display with label, value, optional badge (green/yellow/red) and trend indicator
- `ExportCsvButton` — button that triggers a CSV download via apiClient

#### Scenario: DataTable renders rows

Given a `DataTable` with columns and rows props
When the component renders
Then a table with the column headers and row data SHALL display
And clicking a column header SHALL toggle sort order (if column is sortable)
