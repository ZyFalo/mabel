from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

_model: WhisperModel | None = None


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        from faster_whisper import WhisperModel as WM

        _model = WM(settings.WHISPER_MODEL, compute_type="int8", device="cpu")
    return _model


class AsrService:
    def transcribe(self, file_path: str) -> str:
        model = _get_model()
        segments, _ = model.transcribe(file_path, language="es")
        return " ".join(segment.text.strip() for segment in segments)
