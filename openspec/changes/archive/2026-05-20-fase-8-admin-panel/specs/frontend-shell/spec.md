## MODIFIED Requirements

### Requirement: Admin route tree

The frontend `App.tsx` SHALL register an admin route tree under `/admin/*` wrapped in `<RoleGuard role="admin">` and `<AdminLayout>`. Routes:
- `/admin` → `Dashboard`
- `/admin/users` → `Users`
- `/admin/users/:id` → `UserDetail`
- `/admin/reports` → `Reports`
- `/admin/safety-events` → `SafetyEvents`
- `/admin/metrics` → `Metrics`
- `/admin/config` → `Config`
- `/admin/logs` → `AuditLogs`

A student attempting to navigate to `/admin/*` SHALL be redirected to `/403` (existing behavior of `RoleGuard`).

#### Scenario: Admin nested routes wrapped

Given the admin is authenticated
When the admin navigates to `/admin/users`
Then the page renders inside `AdminLayout` with `AdminSidebar` visible

### Requirement: Login response includes role

The `Login.tsx` `handleSubmit` SHALL navigate based on `response.data.user.role`:
- `admin` → `/admin`
- `student` → existing flow (consent check via `ConsentGuard`)

The auth store SHALL persist the role so subsequent refreshes route correctly.

#### Scenario: Student flow unchanged

Given a student with no consent yet
When the student logs in
Then the redirect SHALL still pass through `ConsentGuard`
