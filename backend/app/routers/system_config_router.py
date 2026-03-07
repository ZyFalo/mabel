from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.repositories.system_config_repository import SystemConfigRepository
from app.schemas.guardrails import SosConfigResponse

router = APIRouter(prefix="/system-config", tags=["system-config"])


@router.get("/sos", response_model=SosConfigResponse)
async def get_sos_config(
    _current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    repo = SystemConfigRepository(db)
    return SosConfigResponse(
        hotline_numbers=await repo.get_sos_hotline_numbers(),
        guardrails_enabled=await repo.get_guardrails_enabled(),
    )
