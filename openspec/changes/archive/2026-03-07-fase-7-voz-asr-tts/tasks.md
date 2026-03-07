## Tasks

### Backend — Config & Scaffold

- [x] 1. Add WHISPER_MODEL, PIPER_VOICE, PIPER_MODEL_PATH, UPLOAD_DIR to Settings in config.py with defaults
- [x] 2. Add .env entries for WHISPER_MODEL, PIPER_VOICE, PIPER_MODEL_PATH, UPLOAD_DIR (commented with defaults)
- [x] 3. Create backend/app/repositories/attachment_repository.py with create() method (message_id, kind, path, meta)

### Backend — ASR

- [x] 4. Create backend/app/services/asr_service.py: AsrService with singleton model loading (faster_whisper.WhisperModel), transcribe(file_path) -> str, language="es", compute_type="int8"
- [x] 5. Create backend/app/routers/asr_router.py: POST /asr/transcribe accepting UploadFile("audio"), saves temp file, transcribes, optionally creates attachment (if save_history), sends text as message via ChatService, returns {"text": transcribed}
- [x] 6. Register asr_router in main.py

### Backend — TTS

- [x] 7. Create backend/app/services/tts_service.py: TtsService with synthesize(text, voice) -> bytes, invokes piper binary via subprocess with model path and voice, captures WAV stdout
- [x] 8. Create backend/app/routers/tts_router.py: GET /tts/synthesize with query params text (required, max 5000) and voice (optional), returns StreamingResponse audio/wav
- [x] 9. Register tts_router in main.py

### Frontend — Microphone (Chat)

- [x] 10. Create frontend/src/hooks/useAudioRecorder.ts: custom hook wrapping MediaRecorder API — startRecording(), stopRecording() -> Blob, isRecording state, error handling
- [x] 11. Add microphone button to Chat.tsx input area: uses useAudioRecorder, pulsing red border (#DC2626) when recording, spinner when processing, sends audio to POST /asr/transcribe then sends transcribed text as message
- [x] 12. Add recording state UI: when isRecording=true, mic button gets animated pulsing border (animate-pulse, border-[#DC2626]), icon turns red

### Frontend — TTS Auto-play (Chat)

- [x] 13. Create frontend/src/hooks/useTts.ts: custom hook — playTts(text, voice) fetches GET /tts/synthesize and plays Audio, stopTts() stops current audio, exposes isMuted (from localStorage), toggleMute(), audioRef for SOS cut
- [x] 14. Integrate useTts in Chat.tsx: after SSE done event, if tts_enabled and not muted, call playTts with response text and preferences.tts_voice
- [x] 15. Add mute/unmute button to Chat.tsx input area: toggles mute state, persists in localStorage (mabel_tts_muted), shows speaker/muted icon

### Frontend — Subtitles (Chat)

- [x] 16. Create frontend/src/hooks/useSubtitles.ts: custom hook — startSubtitles(text, durationMs) splits text into words, calculates timing per word proportionally, returns currentWordIndex via setInterval, stopSubtitles() clears interval
- [x] 17. Modify assistant bubble rendering in Chat.tsx: when subtitles are active for a message, render words with span elements, highlight current word with bg-primary/20 class

### Frontend — TTS Cut on SOS

- [x] 18. Extend SOS trigger in Chat.tsx: when riskDetected or SOS opens, call stopTts() from useTts hook to stop any playing TTS audio (in addition to existing speechSynthesis.cancel and audio.pause)

### Frontend — Settings Voice Section

- [x] 19. Add TTS enabled toggle to Settings.tsx voice section: controls accessibility.tts_enabled (boolean), saved with accessibility JSONB via updatePreferences
- [x] 20. Add Preview button to Settings.tsx voice section: fetches GET /tts/synthesize?text=Hola, soy Mabel&voice=<selected> and plays audio
- [x] 21. Load ttsEnabled state from preferences.accessibility.tts_enabled on Settings mount, default to true if undefined

### Dependencies

- [x] 22. Add faster-whisper to backend requirements.txt (or pyproject.toml)
- [x] 23. Add piper-tts download instructions to README or create a setup script for the piper binary + Spanish model
