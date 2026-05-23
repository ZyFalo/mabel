import hashlib
import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.database import get_db
from app.middleware.auth import require_consent
from app.models.user import User
from app.repositories.attachment_repository import AttachmentRepository
from app.repositories.message_repository import MessageRepository
from app.repositories.preference_repository import PreferenceRepository
from app.repositories.session_repository import SessionRepository
from app.services.asr_service import AsrService

router = APIRouter(prefix="/asr", tags=["asr"])


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile,
    session_id: uuid.UUID | None = None,
    current_user: User = Depends(require_consent),
    db=Depends(get_db),
):
    # Save uploaded file to temp location
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_id = uuid.uuid4()
    ext = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    file_path = os.path.join(settings.UPLOAD_DIR, f"{file_id}{ext}")

    content_bytes = await audio.read()
    with open(file_path, "wb") as f:
        f.write(content_bytes)

    # Transcribe
    try:
        asr = AsrService()
        text = asr.transcribe(file_path)
    except Exception as e:
        # Log el error real (antes lo tragabamos y devolviamos un 500
        # genérico — imposible debuggear sin tocar el código).
        logger.exception(
            "ASR failed for %s (size=%d)", file_path, len(content_bytes)
        )
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=500,
            detail=f"Error al transcribir audio: {type(e).__name__}: {e}",
        ) from e

    if not text or not text.strip():
        # PRIVACY (Ley 1581 / D-14): si el usuario esta en save_history=false
        # (solo_uso), NO debemos persistir audio biometrico bajo ninguna
        # circunstancia, ni siquiera "para forensics". Solo retenemos cuando
        # el usuario consintio retencion via consent.scope. Los empty-text
        # casos en sesiones save_history=true se mantienen para diagnostico.
        keep_for_forensics = False
        if session_id:
            try:
                pref_repo = PreferenceRepository(db)
                prefs = await pref_repo.get_by_user_id(current_user.id)
                keep_for_forensics = bool(prefs and prefs.save_history)
            except Exception:  # noqa: BLE001 - best-effort, fail closed
                keep_for_forensics = False
        if not keep_for_forensics and os.path.exists(file_path):
            os.remove(file_path)
        logger.warning(
            "ASR returned empty text for %s (size=%d bytes, kept=%s).",
            file_path,
            len(content_bytes),
            keep_for_forensics,
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"No se detecto texto en el audio "
                f"({len(content_bytes)} bytes capturados). "
                "Habla mas claro y mantén pulsado el botón al menos 1 segundo."
            ),
        )

    # If session_id provided, persist message and optionally attachment
    message_id = None
    if session_id:
        session_repo = SessionRepository(db)
        session = await session_repo.get_by_id(session_id)
        if not session or session.user_id != current_user.id:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=403, detail="Acceso denegado")
        if session.ended_at is not None:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=409, detail="Sesion finalizada")

        pref_repo = PreferenceRepository(db)
        prefs = await pref_repo.get_by_user_id(current_user.id)
        save_history = prefs.save_history if prefs else False

        if save_history:
            msg_repo = MessageRepository(db)
            content_hash = hashlib.sha256(text.encode()).hexdigest()
            msg = await msg_repo.create(
                session_id=session_id,
                role="user",
                content=text,
                content_sha256=content_hash,
            )
            message_id = str(msg.id)

            # Create attachment linked to the message
            att_repo = AttachmentRepository(db)
            await att_repo.create(
                message_id=msg.id,
                kind="audio",
                path=file_path,
                meta={
                    "format": ext.lstrip("."),
                    "size_bytes": len(content_bytes),
                },
            )
            await db.commit()
        else:
            # Don't persist — clean up audio file
            if os.path.exists(file_path):
                os.remove(file_path)
    else:
        # No session — clean up audio file
        if os.path.exists(file_path):
            os.remove(file_path)

    return {"text": text.strip(), "message_id": message_id}
