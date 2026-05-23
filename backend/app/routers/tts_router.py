import io
import subprocess

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.middleware.auth import require_consent
from app.models.user import User
from app.services.tts_service import TtsService

router = APIRouter(prefix="/tts", tags=["tts"])


@router.get("/synthesize")
async def synthesize_speech(
    text: str = Query(min_length=1, max_length=5000),
    voice: str | None = Query(default=None),
    current_user: User = Depends(require_consent),
):
    tts = TtsService()
    try:
        audio_bytes = tts.synthesize(text, voice)
    except subprocess.TimeoutExpired as e:
        # Aunque TtsService convierte timeout → ValueError, dejamos este
        # branch como red de seguridad: si alguien refactoriza el servicio
        # y vuelve a expone TimeoutExpired, NO debe caer como 500 sin
        # CORS headers (el bug que justamente este endpoint busca evitar).
        raise HTTPException(
            status_code=504,
            detail="TTS tardo demasiado en responder.",
        ) from e
    except FileNotFoundError as e:
        # Piper binario o modelo no encontrado. Devolvemos 503 (Service
        # Unavailable) en vez de dejar que la excepcion bubble como 500
        # sin headers — un 500 generado por excepcion no manejada se
        # renderea ANTES del CORS middleware y el browser termina
        # mostrando "CORS error" en lugar del error real, lo que
        # confunde mucho el debugging.
        raise HTTPException(
            status_code=503,
            detail=f"TTS no disponible: {e}",
        ) from e
    except ValueError as e:
        raise HTTPException(
            status_code=500, detail=f"Error al sintetizar audio: {e}"
        ) from e

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=tts.wav"},
    )
