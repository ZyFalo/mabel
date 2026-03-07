## MODIFIED Requirements

### Requirement: TTS toggle in Settings

The Settings voice section SHALL include a toggle "TTS activado" that controls accessibility.tts_enabled in the preferences JSONB. When disabled, the Chat page SHALL not request or play TTS audio. The toggle SHALL default to true (TTS enabled).

#### Scenario: Disable TTS

Given a student disables the TTS toggle in Settings
When the preference is saved
Then accessibility.tts_enabled SHALL be set to false
And the Chat page SHALL not request TTS synthesis

### Requirement: Voice preview in Settings

The Settings voice section SHALL include a "Preview" button next to the voice selector. When clicked, it SHALL request GET /api/v1/tts/synthesize?text=Hola, soy Mabel&voice=<selected_voice> and play the returned audio.

#### Scenario: Preview voice

Given a student selects a voice and clicks Preview
When the TTS endpoint responds with audio
Then the audio SHALL play immediately as a preview
