## MODIFIED Requirements

### Requirement: Register admin routers

The `app/main.py` SHALL import and register 6 new admin routers under prefix `/api/v1/admin`:
- `admin/users_router.py` (`/admin/users/*`)
- `admin/reports_router.py` (`/admin/reports/*`)
- `admin/safety_events_router.py` (`/admin/safety-events/*`)
- `admin/metrics_router.py` (`/admin/metrics/*` and `/admin/dashboard`)
- `admin/config_router.py` (`/admin/config/*` and `/admin/consent-versions/*`)
- `admin/audit_logs_router.py` (`/admin/logs/*`)

Each router file SHALL declare `router = APIRouter(prefix="...", tags=["admin"])` with the prefix appropriate to its scope. `main.py` SHALL include each with `app.include_router(<router>, prefix="/api/v1")`.

#### Scenario: Admin routers reachable

Given the FastAPI app starts
When a request hits `/api/v1/admin/dashboard` with admin JWT
Then the request SHALL be routed to the dashboard endpoint
