from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

# Admin routers (Fase 8)
from app.routers.admin.audit_logs_router import router as admin_audit_logs_router
from app.routers.admin.config_router import router as admin_config_router
from app.routers.admin.empathy_ratings_router import (
    router as admin_empathy_ratings_router,
)
from app.routers.admin.metrics_router import router as admin_metrics_router
from app.routers.admin.reports_router import router as admin_reports_router
from app.routers.admin.safety_events_router import router as admin_safety_events_router
from app.routers.admin.users_router import router as admin_users_router
from app.routers.asr_router import router as asr_router
from app.routers.auth_router import router as auth_router
from app.routers.consent_router import router as consent_router
from app.routers.preference_router import router as preference_router
from app.routers.report_router import router as report_router
from app.routers.safety_event_router import router as safety_event_router
from app.routers.session_router import router as session_router
from app.routers.system_config_router import router as system_config_router
from app.routers.tts_router import router as tts_router
from app.routers.users_router import router as users_router
from app.services.admin.config_service import mark_process_started


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI startup/shutdown hook.

    Owns process-boot anchors that must NOT be tied to module import
    time (e.g. `_PROCESS_START_TS` for the admin uptime tile in
    `/admin/config` §05). The lifespan fires exactly once per worker
    boot — survives test re-imports and tooling that might otherwise
    rebind module-level singletons.
    """
    mark_process_started()
    yield


app = FastAPI(title="Mabel IA", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(asr_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(consent_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(preference_router, prefix="/api/v1")
app.include_router(session_router, prefix="/api/v1")
app.include_router(report_router, prefix="/api/v1")
app.include_router(safety_event_router, prefix="/api/v1")
app.include_router(system_config_router, prefix="/api/v1")
app.include_router(tts_router, prefix="/api/v1")

# Admin routers (grouped at the end)
app.include_router(admin_users_router, prefix="/api/v1")
app.include_router(admin_reports_router, prefix="/api/v1")
app.include_router(admin_safety_events_router, prefix="/api/v1")
app.include_router(admin_metrics_router, prefix="/api/v1")
app.include_router(admin_config_router, prefix="/api/v1")
app.include_router(admin_audit_logs_router, prefix="/api/v1")
app.include_router(admin_empathy_ratings_router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
