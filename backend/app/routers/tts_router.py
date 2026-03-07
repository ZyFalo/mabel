import io

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
    except ValueError:
        raise HTTPException(status_code=500, detail="Error al sintetizar audio")

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=tts.wav"},
    )
