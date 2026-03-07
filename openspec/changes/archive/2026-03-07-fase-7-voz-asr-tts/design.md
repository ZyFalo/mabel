## Design Decisions

### D-01: faster-whisper model selection

**Decision:** Usar modelo `base` de faster-whisper por defecto (configurable via WHISPER_MODEL env var). Ejecutar en CPU con compute_type="int8" para el MVP.

**Rationale:** El modelo `base` ofrece buen balance entre latencia (~2-3s para utterances cortas en CPU) y calidad en espanol. El modelo `small` es alternativa si la calidad es insuficiente. No se requiere GPU para el MVP (30 estudiantes, uso no concurrente).

### D-02: Piper TTS via subprocess

**Decision:** Ejecutar Piper TTS como proceso via subprocess (no como libreria Python). El binary de piper se invoca con el modelo espanol y retorna WAV via stdout.

**Rationale:** Piper esta disenado como CLI tool. Invocarlo via subprocess es la forma mas simple y robusta. El modelo espanol (es_ES/mls) se descarga como archivo .onnx. La ruta se configura via PIPER_MODEL_PATH. La voz por defecto via PIPER_VOICE.

### D-03: Audio upload flow

**Decision:** El frontend graba audio con MediaRecorder API (WebM/opus), lo envia como multipart/form-data a POST /api/v1/asr/transcribe. El backend guarda el archivo en UPLOAD_DIR, transcribe con faster-whisper, y retorna el texto. Si save_history=true, se crea un attachment (kind='audio') vinculado al mensaje del usuario.

**Rationale:** WebM/opus es el formato nativo de MediaRecorder en Chrome/Firefox. faster-whisper acepta multiples formatos via ffmpeg. El archivo se persiste para auditoria (si save_history).

### D-04: TTS auto-play and mute

**Decision:** Al completarse el SSE stream de respuesta del asistente (evento done), el frontend solicita GET /api/v1/tts/synthesize?text=<response>&voice=<tts_voice>. El audio se reproduce automaticamente con new Audio(). Un boton mute global persiste estado en localStorage. Si mute=true, no se solicita TTS. Si subtitles=true, se activa el resaltado word-by-word.

**Rationale:** Auto-play es la decision PO (#10). El mute persiste en localStorage para sobrevivir refrescos. El TTS no se solicita si mute=true para ahorrar latencia. La preferencia tts_voice viene del store de preferences.

### D-05: Subtitulos word-by-word

**Decision:** Se implementa con estimacion de timing proporcional al largo de cada palabra. Al reproducir TTS, se divide el texto en palabras y se calcula el timing de cada una basado en la duracion total del audio. Un intervalo setInterval actualiza la palabra resaltada. La burbuja del asistente muestra las palabras con highlight progresivo (bg-primary/20).

**Rationale:** Web Speech API no ofrece eventos de palabra para audio custom. La estimacion proporcional es suficiente para el MVP. No requiere alineacion forzada (forced alignment) que seria post-MVP.

### D-06: TTS corte en SOS (integracion con Fase 4)

**Decision:** El hook existente en Chat.tsx (speechSynthesis.cancel + audio.pause) se extiende para tambien detener el Audio() del TTS. Se expone una referencia global al audio TTS actual (ttsAudioRef) que se limpia al abrir SOS.

**Rationale:** Mantiene consistencia con la implementacion de Fase 4. Reutiliza el patron existente.

### D-07: Estructura de archivos backend

**Decision:**
- `backend/app/services/asr_service.py` — wrapper de faster-whisper
- `backend/app/services/tts_service.py` — wrapper de piper subprocess
- `backend/app/routers/asr_router.py` — POST /asr/transcribe
- `backend/app/routers/tts_router.py` — GET /tts/synthesize
- `backend/app/repositories/attachment_repository.py` — CRUD attachments

**Rationale:** Sigue el patron existente de la app (service/router/repository layers).

### D-08: Settings voice preview

**Decision:** Agregar boton "Preview" junto al selector de voz en Settings (#15) que solicita GET /api/v1/tts/synthesize?text=Hola, soy Mabel&voice=<selected> y reproduce el audio.

**Rationale:** El usuario necesita escuchar la voz antes de elegirla. Usa el mismo endpoint TTS existente.

### D-09: Toggle TTS en Settings

**Decision:** Agregar toggle "TTS activado" en la seccion Voz de Settings. Se persiste en preferences.accessibility.tts_enabled (boolean en JSONB). Si tts_enabled=false, el frontend no solicita TTS ni muestra boton mute.

**Rationale:** Algunos estudiantes pueden preferir solo texto. Usar accessibility JSONB evita migracion de BD.
