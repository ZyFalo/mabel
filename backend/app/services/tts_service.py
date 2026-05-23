import subprocess
from pathlib import Path

from app.core.config import settings


def piper_model_path(voice: str | None = None) -> Path:
    """Resolve the absolute path to a Piper voice model.

    Single source of truth used by both the runtime (`TtsService`) and
    the admin health check (`AdminConfigService.get_services_health`) so
    they never disagree about whether a voice is installed.

    Resolves the configured `PIPER_MODEL_PATH` relative to the current
    working directory (`Path.resolve()`) and joins the voice filename
    with the `/` operator — never with raw string concatenation, which
    silently produced bogus paths like `models/pipavoice.onnx` when the
    env var lacked a trailing slash.
    """
    voice = voice or settings.PIPER_VOICE
    base = Path(settings.PIPER_MODEL_PATH).expanduser().resolve()
    return base / f"{voice}.onnx"


def piper_model_files(voice: str | None = None) -> tuple[Path, Path]:
    """Return (onnx_path, sidecar_json_path) for a Piper voice.

    Piper REQUIRES both files: the `.onnx` weights and the `.onnx.json`
    metadata sidecar. Verifying only the `.onnx` (as the health check
    did before 2026-05-23) misses the case where the sidecar is missing
    or corrupted: health reports OK but every synthesis call fails at
    runtime with `Piper TTS failed`.

    Implementation note: building the sidecar via `parent / f"{name}.json"`
    instead of `Path.with_suffix(".onnx.json")` keeps this portable
    across Python versions — multi-dot suffix handling has changed
    between releases and Path.with_suffix has historically rejected
    suffixes containing internal dots.
    """
    onnx = piper_model_path(voice)
    sidecar = onnx.parent / f"{onnx.name}.json"
    return onnx, sidecar


class TtsService:
    def synthesize(self, text: str, voice: str | None = None) -> bytes:
        model_path = piper_model_path(voice)

        result = subprocess.run(
            [
                "piper",
                "--model", str(model_path),
                "--output-raw",
            ],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise ValueError(f"Piper TTS failed: {result.stderr.decode()}")

        return result.stdout
