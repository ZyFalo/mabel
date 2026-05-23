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

        # Piper (1.4.x) NO soporta `--output-file -` para stdout — exige
        # path real. Y SIN `--output-file` intenta llamar `ffplay` para
        # reproducir directo (lo que falla en servidor). Workaround:
        # archivo temporal → leer → borrar. Antes usabamos `--output-raw`
        # que devolvia PCM crudo, pero el browser no puede reproducir
        # PCM sin header WAV — por eso fallaba useTts.
        import tempfile

        with tempfile.NamedTemporaryFile(
            suffix=".wav", delete=False
        ) as tmp:
            tmp_path = tmp.name

        proc: subprocess.Popen[bytes] | None = None
        try:
            # Popen + communicate(timeout=...) en vez de subprocess.run para
            # poder llamar `kill()` + `wait()` explicitos en caso de timeout.
            # `subprocess.run(timeout=N)` solo manda SIGKILL al proceso
            # inmediato pero NO espera a sus children/threads: Piper internamente
            # usa onnxruntime con threads que pueden quedar zombies escribiendo
            # al inode borrado tras unlink(), consumiendo CPU/RAM hasta morir
            # uvicorn. Bajo burst load esto se acumulaba a OOM.
            proc = subprocess.Popen(
                [
                    "piper",
                    "--model", str(model_path),
                    "--output-file", tmp_path,
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            try:
                _, stderr_bytes = proc.communicate(
                    input=text.encode("utf-8"), timeout=30
                )
            except subprocess.TimeoutExpired:
                # Mata el proceso y espera a que termine antes de unlink.
                # `kill()` envia SIGKILL al proceso inmediato; el `wait()`
                # bloquea hasta que el kernel libere el inode. Sin esto,
                # Piper podia seguir escribiendo a un archivo borrado.
                proc.kill()
                try:
                    proc.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
                raise ValueError(
                    "Piper TTS timeout (30s) — texto demasiado largo o "
                    "modelo no respondiendo."
                ) from None

            if proc.returncode != 0:
                raise ValueError(
                    f"Piper TTS failed: {stderr_bytes.decode(errors='replace')}"
                )
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            # Limpieza belt-and-suspenders por si el flow llego aqui sin
            # haber esperado al proceso correctamente.
            if proc is not None and proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=2)
                except Exception:
                    pass
            try:
                Path(tmp_path).unlink()
            except FileNotFoundError:
                pass
