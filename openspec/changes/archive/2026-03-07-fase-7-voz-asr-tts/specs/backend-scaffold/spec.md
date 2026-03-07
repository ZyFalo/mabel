## MODIFIED Requirements

### Requirement: Register ASR and TTS routers

The main.py SHALL import and register asr_router and tts_router with prefix /api/v1. The routers SHALL be available at /api/v1/asr/* and /api/v1/tts/*.

#### Scenario: Routers registered

Given the FastAPI app starts
When the routers are loaded
Then /api/v1/asr/transcribe and /api/v1/tts/synthesize SHALL be available

### Requirement: Voice environment variables

The config.py Settings class SHALL include WHISPER_MODEL (str, default "base"), PIPER_VOICE (str, default "es_ES-mls_9972-low"), PIPER_MODEL_PATH (str, default "models/piper/"), and UPLOAD_DIR (str, default "uploads/audio/"). These SHALL be loaded from .env.

#### Scenario: Config loaded with defaults

Given no voice env vars are set in .env
When Settings initializes
Then WHISPER_MODEL SHALL be "base"
And PIPER_VOICE SHALL be "es_ES-mls_9972-low"
And PIPER_MODEL_PATH SHALL be "models/piper/"
And UPLOAD_DIR SHALL be "uploads/audio/"
