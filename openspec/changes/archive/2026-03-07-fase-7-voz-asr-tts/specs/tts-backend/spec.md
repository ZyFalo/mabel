## ADDED Requirements

### Requirement: TTS synthesis endpoint

The backend SHALL expose GET /api/v1/tts/synthesize with query parameters text (required, max 5000 chars) and voice (optional, defaults to PIPER_VOICE env var). The endpoint SHALL generate audio using Piper TTS and return a StreamingResponse with media_type="audio/wav". The endpoint SHALL require authentication (require_consent).

#### Scenario: Successful synthesis

Given a student requests GET /api/v1/tts/synthesize?text=Hola
When Piper TTS processes the text
Then the endpoint SHALL return 200 with audio/wav content

#### Scenario: Empty text

Given a student requests GET /api/v1/tts/synthesize?text=
When the endpoint validates the request
Then it SHALL return 422

### Requirement: TTS service wrapper

The backend SHALL provide a TtsService class that wraps Piper TTS via subprocess. The service SHALL invoke the piper binary with the model at PIPER_MODEL_PATH and output WAV to stdout. The service SHALL support voice selection via the voice parameter. The service SHALL return raw WAV bytes.

#### Scenario: Service synthesizes text

Given a text string and voice identifier
When TtsService.synthesize(text, voice) is called
Then it SHALL return WAV audio bytes
