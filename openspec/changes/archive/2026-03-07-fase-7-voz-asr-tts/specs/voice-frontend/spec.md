## ADDED Requirements

### Requirement: Microphone button in Chat

The Chat page SHALL include a microphone button next to the text input. When pressed, it SHALL start recording audio using MediaRecorder API (WebM/opus). While recording, the button SHALL show a pulsing red border (#DC2626) and red icon. A second press SHALL stop recording and send the audio to POST /api/v1/asr/transcribe. While processing, the button SHALL show a spinner state. On successful transcription, the text SHALL be sent as a normal message via sendMessage.

#### Scenario: Record and transcribe

Given a student clicks the microphone button
When they speak and click again to stop
Then the audio SHALL be sent to ASR endpoint
And the transcribed text SHALL be sent as a chat message

#### Scenario: Recording indicator

Given a student is recording audio
When the microphone is active
Then the button SHALL display a pulsing red border (#DC2626) and red icon

### Requirement: TTS auto-play

After the SSE stream completes (done event received) for an assistant message, the Chat page SHALL request GET /api/v1/tts/synthesize with the response text and the user's tts_voice preference. The audio SHALL play automatically. This SHALL only occur if TTS is enabled (accessibility.tts_enabled !== false) and mute is not active.

#### Scenario: Auto-play after response

Given TTS is enabled and not muted
When an assistant response completes streaming
Then the frontend SHALL request TTS synthesis and play the audio automatically

#### Scenario: Muted TTS skips request

Given the mute toggle is active
When an assistant response completes
Then the frontend SHALL NOT request TTS synthesis

### Requirement: Mute global toggle

The Chat page SHALL include a mute/unmute button in the input area. The mute state SHALL persist in localStorage (key: mabel_tts_muted). When muted, TTS SHALL not be requested and any playing audio SHALL be stopped.

#### Scenario: Mute persists across refresh

Given a student toggles mute on and refreshes the page
When the Chat page reloads
Then the mute state SHALL still be active

### Requirement: Word-by-word subtitles

When TTS audio is playing and subtitles are enabled (accessibility.subtitles), the Chat page SHALL highlight words progressively in the assistant's bubble. Words SHALL be highlighted with a bg-primary/20 background. The timing SHALL be estimated proportionally based on word length relative to total audio duration. The highlight SHALL advance with each word as the audio plays.

#### Scenario: Subtitles active during TTS

Given subtitles are enabled and TTS is playing
When the audio progresses
Then words in the assistant bubble SHALL be highlighted progressively

### Requirement: TTS cut on SOS

When the SOS panel opens (risk detected or manual), any currently playing TTS audio SHALL be stopped immediately. The existing speechSynthesis.cancel and audio pause logic SHALL be extended to also stop the TTS Audio object.

#### Scenario: SOS interrupts TTS

Given TTS audio is currently playing
When the SOS panel is triggered
Then the TTS audio SHALL be stopped immediately
