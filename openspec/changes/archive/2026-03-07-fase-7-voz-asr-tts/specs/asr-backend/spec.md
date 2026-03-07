## ADDED Requirements

### Requirement: ASR transcription endpoint

The backend SHALL expose POST /api/v1/asr/transcribe that accepts audio as multipart/form-data (field name: "audio"). The endpoint SHALL transcribe the audio using faster-whisper with the model specified by WHISPER_MODEL env var (default: "base"). The endpoint SHALL return JSON with the transcribed text. The endpoint SHALL require authentication (require_consent).

#### Scenario: Successful transcription

Given a student sends a WebM audio file to POST /api/v1/asr/transcribe
When faster-whisper processes the audio
Then the endpoint SHALL return 200 with {"text": "<transcribed text>"}

#### Scenario: No audio provided

Given a student sends a request without an audio file
When the endpoint validates the request
Then it SHALL return 422

### Requirement: ASR service wrapper

The backend SHALL provide an AsrService class that wraps faster-whisper. The service SHALL load the model once on initialization (singleton). The service SHALL transcribe audio files and return the concatenated text from all segments. The service SHALL use language="es" and compute_type="int8" for CPU inference.

#### Scenario: Service transcribes audio

Given an audio file at a filesystem path
When AsrService.transcribe(file_path) is called
Then it SHALL return the transcribed text as a string

### Requirement: Audio attachment persistence

When save_history is true for the current user, the ASR endpoint SHALL save the uploaded audio file to UPLOAD_DIR and create an attachment record with kind='audio', path=<saved file path>, meta={format, size_bytes}, linked to the user message. The attachment SHALL only be created if save_history is enabled.

#### Scenario: Audio saved with history enabled

Given a student with save_history=true sends audio
When the audio is transcribed successfully
Then an attachment record SHALL be created with kind='audio'
And the audio file SHALL be saved to UPLOAD_DIR

#### Scenario: Audio not saved with history disabled

Given a student with save_history=false sends audio
When the audio is transcribed successfully
Then no attachment record SHALL be created
And the audio file SHALL be deleted after transcription
