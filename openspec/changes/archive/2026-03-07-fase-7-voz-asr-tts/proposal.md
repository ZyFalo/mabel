## Why

Mabel IA necesita soporte de voz para el hito pilotable con 30 estudiantes UMB. HU-07 (ASR: entrada por voz), HU-08 (TTS: salida por voz), HU-09 (subtitulos sincronizados) son requisitos del estudio cuasiexperimental. El chat actualmente es solo texto. Esta fase agrega ASR (faster-whisper), TTS (Piper TTS), boton microfono con indicador pulsante, auto-play TTS, mute global, y subtitulos word-by-word.

## What Changes

- Nuevo endpoint POST /api/v1/asr/transcribe: recibe audio WebM, transcribe con faster-whisper, retorna texto
- Nuevo endpoint GET /api/v1/tts/synthesize: genera audio WAV con Piper TTS, retorna stream
- Nuevo AttachmentRepository para persistir audio original como attachment (kind='audio')
- Boton microfono en Chat (#10): MediaRecorder API, indicador pulsante rojo (#DC2626), estados grabando/procesando
- Auto-play TTS al recibir respuesta del asistente, con boton mute global
- Subtitulos word-by-word: resaltado progresivo sincronizado con audio TTS (HU-09)
- Settings (#15): toggle TTS on/off, preview de voz
- Variables de entorno: WHISPER_MODEL, PIPER_VOICE, PIPER_MODEL_PATH, UPLOAD_DIR
- Routers de ASR y TTS registrados en main.py

## Capabilities

### New Capabilities

- `asr-backend`: ASR endpoint con faster-whisper, attachment persistence, audio upload
- `tts-backend`: TTS endpoint con Piper TTS, audio stream, voice selection
- `voice-frontend`: Microfono, auto-play TTS, mute global, subtitulos word-by-word en Chat
- `voice-preferences-frontend`: Toggle TTS, preview de voz en Settings

### Modified Capabilities

- `backend-scaffold`: Agregar asr_router y tts_router al main.py, nuevas env vars en config.py

## Impact

- Backend: 2 routers nuevos, 2 services nuevos, 1 repository nuevo, config.py modificado, main.py modificado
- Frontend: Chat.tsx modificado (microfono, TTS, subtitulos), Settings.tsx modificado (toggle TTS, preview)
- Dependencias Python: faster-whisper, piper-tts (o subprocess con piper binary)
- Dependencias sistema: piper binary + modelo espanol
- Filesystem: directorio UPLOAD_DIR para audio temporal
- .env: 4 nuevas variables (WHISPER_MODEL, PIPER_VOICE, PIPER_MODEL_PATH, UPLOAD_DIR)
