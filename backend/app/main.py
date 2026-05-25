import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings

# CR-05 (review 2026-05-25): Python 3.11 stdlib NO registra
# `.webmanifest` → vite-plugin-pwa emite `/manifest.webmanifest` y sin
# este registro `FileResponse` lo sirve con `application/octet-stream`,
# lo que Firefox rechaza con "Manifest fetched but mime type incorrect"
# y la PWA no se ofrece para instalar.
mimetypes.add_type("application/manifest+json", ".webmanifest")

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
from app.routers.data_control_router import router as data_control_router
from app.routers.llm_health_router import router as llm_health_router
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

    Validamos aquí (no en config.py) que `JWT_SECRET` esté presente:
    el web emite y verifica JWTs, así que arrancar sin el secreto es
    una falla de seguridad. Procesos auxiliares (cron de retención)
    importan `settings` sin necesitar JWT y deben poder hacerlo —
    por eso config.py le da default vacío.
    """
    if not settings.JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET no está configurado. El web service no puede "
            "arrancar sin el secreto de firma de JWTs. Configúralo en "
            ".env (local) o en las variables del servicio en Railway."
        )
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
app.include_router(data_control_router, prefix="/api/v1")
app.include_router(llm_health_router, prefix="/api/v1")

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


# ---------------------------------------------------------------------------
# Frontend SPA — sirve el build de Vite cuando existe (deploy en Railway).
# En dev local el frontend corre aparte en :5173, asi que si no hay carpeta
# `static/` simplemente no montamos nada y los browsers ven el 404 esperado.
# ---------------------------------------------------------------------------

_FRONTEND_DIR = (Path(__file__).resolve().parent.parent / "static").resolve()

if _FRONTEND_DIR.is_dir():
    # /assets/* y demas archivos de Vite con sus hashes
    _ASSETS_DIR = _FRONTEND_DIR / "assets"
    if _ASSETS_DIR.is_dir():
        app.mount(
            "/assets", StaticFiles(directory=str(_ASSETS_DIR)), name="assets"
        )

    _INDEX_FILE = _FRONTEND_DIR / "index.html"

    # Solo registramos el catch-all si el build esta completo. Sin esto, un
    # static/ parcial (sin index.html) provocaria 500 silencioso en cada
    # request al SPA porque FileResponse rompe sobre archivo inexistente.
    if _INDEX_FILE.is_file():

        # CR-05 (review 2026-05-25): el service worker (`sw.js`) y los
        # artefactos PWA (`manifest.webmanifest`, `workbox-*.js`,
        # `registerSW.js`) DEBEN servirse con `Cache-Control: no-cache`.
        # Sin esto el browser aplica heuristic caching (~10% del
        # Last-Modified delta) y pinea a usuarios en una versión vieja
        # del SW indefinidamente — `registerType: 'autoUpdate'` solo
        # dispara cuando el browser re-fetcha `sw.js`.
        _NO_CACHE_PATTERNS = (
            "sw.js",
            "manifest.webmanifest",
            "registerSW.js",
        )

        def _spa_file_response(path: Path) -> FileResponse:
            name = path.name
            if name in _NO_CACHE_PATTERNS or name.startswith("workbox-"):
                return FileResponse(
                    path,
                    headers={
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                    },
                )
            return FileResponse(path)

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            """Catch-all para React Router. SEGURIDAD: resolvemos la ruta
            destino y verificamos que quede DENTRO de `_FRONTEND_DIR`
            antes de servirla; sin esta validacion, un GET con `../`
            permitiria leer cualquier archivo legible del container
            (config.py con JWT_SECRET, .env files leakeados al build,
            todo el codigo fuente).
            """
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404)
            if not full_path:
                return _spa_file_response(_INDEX_FILE)
            candidate = (_FRONTEND_DIR / full_path).resolve()
            try:
                candidate.relative_to(_FRONTEND_DIR)
            except ValueError:
                # Intento de path traversal: caemos al SPA en vez de 403
                # para no filtrar la existencia del filtro.
                return _spa_file_response(_INDEX_FILE)
            if candidate.is_file():
                return _spa_file_response(candidate)
            # Si piden un archivo PWA conocido y NO existe, devolver 404
            # explícito en lugar de servir index.html (que falla la
            # registración SW silenciosamente con un misleading parse
            # error en console).
            if (
                candidate.name in _NO_CACHE_PATTERNS
                or candidate.name.startswith("workbox-")
                or candidate.suffix in (".js", ".webmanifest", ".json", ".map")
            ):
                raise HTTPException(status_code=404)
            return _spa_file_response(_INDEX_FILE)
