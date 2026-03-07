import subprocess

from app.core.config import settings


class TtsService:
    def synthesize(self, text: str, voice: str | None = None) -> bytes:
        voice = voice or settings.PIPER_VOICE
        model_path = f"{settings.PIPER_MODEL_PATH}{voice}.onnx"

        result = subprocess.run(
            [
                "piper",
                "--model", model_path,
                "--output-raw",
            ],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise ValueError(f"Piper TTS failed: {result.stderr.decode()}")

        return result.stdout
