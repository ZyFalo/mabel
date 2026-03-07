from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.auth_router import router as auth_router
from app.routers.consent_router import router as consent_router
from app.routers.report_router import router as report_router
from app.routers.safety_event_router import router as safety_event_router
from app.routers.session_router import router as session_router
from app.routers.system_config_router import router as system_config_router
from app.routers.users_router import router as users_router

app = FastAPI(title="Mabel IA", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(consent_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(session_router, prefix="/api/v1")
app.include_router(report_router, prefix="/api/v1")
app.include_router(safety_event_router, prefix="/api/v1")
app.include_router(system_config_router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
