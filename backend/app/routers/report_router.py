import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_db
from app.middleware.auth import require_consent
from app.models.user import User
from app.repositories.message_report_repository import MessageReportRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.safety_event_repository import SafetyEventRepository
from app.repositories.session_repository import SessionRepository
from app.schemas.chat import CreateReportRequest, ReportCheckResponse, ReportResponse
from app.services.report_service import ReportService

router = APIRouter(prefix="/messages", tags=["reports"])


def _get_report_service(db=Depends(get_db)) -> ReportService:
    return ReportService(
        report_repo=MessageReportRepository(db),
        message_repo=MessageRepository(db),
        session_repo=SessionRepository(db),
        event_repo=SafetyEventRepository(db),
    )


@router.post("/{message_id}/reports", status_code=status.HTTP_201_CREATED, response_model=ReportResponse)
async def create_report(
    message_id: uuid.UUID,
    body: CreateReportRequest,
    current_user: User = Depends(require_consent),
    service: ReportService = Depends(_get_report_service),
):
    try:
        report = await service.create_report(
            message_id=message_id,
            reporter_id=current_user.id,
            reason=body.reason,
            severity=body.severity,
            details=body.details,
        )
    except ValueError as e:
        msg = str(e)
        if "NOT_FOUND" in msg:
            raise HTTPException(status_code=404, detail="Mensaje no encontrado")
        if "ACCESS_DENIED" in msg:
            raise HTTPException(status_code=403, detail="Acceso denegado")
        if "CANNOT_REPORT" in msg:
            raise HTTPException(status_code=400, detail="Solo puedes reportar mensajes del asistente")
        if "DUPLICATE" in msg:
            raise HTTPException(status_code=409, detail="Ya reportaste este mensaje")
        raise
    return ReportResponse.model_validate(report)


@router.get("/{message_id}/reports/check", response_model=ReportCheckResponse)
async def check_report(
    message_id: uuid.UUID,
    current_user: User = Depends(require_consent),
    service: ReportService = Depends(_get_report_service),
):
    already = await service.check_report(message_id, current_user.id)
    return ReportCheckResponse(already_reported=already)
