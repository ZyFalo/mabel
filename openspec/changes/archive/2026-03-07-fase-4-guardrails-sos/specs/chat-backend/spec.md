## MODIFIED Requirements

### Requirement: Send message with guardrails integration
The `ChatService.send_message` method SHALL integrate pre-filter and post-filter guardrails.

#### Scenario: Pre-filter before LLM call
- **WHEN** `send_message` is called with user content
- **THEN** it SHALL call `GuardrailsService.pre_filter(content, session_id, user_id)` BEFORE calling `LLMProvider.generate_stream`
- **THEN** if pre-filter returns `risk_detected: true`, the first SSE event SHALL be `data: {"risk_detected": true, "severity": N}\n\n`
- **THEN** the message SHALL still be sent to Gemini (Mabel responds empathetically even during crisis)
- **THEN** if `save_history = true`, the user message SHALL be persisted with `safety_flags` = `{ "risk_detected": true, "keywords": [...], "severity": N }`

#### Scenario: Post-filter after LLM response
- **WHEN** the full assistant response has been accumulated from streaming
- **THEN** it SHALL call `GuardrailsService.post_filter(full_response, session_id, user_id, message_id)`
- **THEN** if post-filter returns `risk_detected: true`, the `done` SSE event SHALL include `"risk_detected": true`
- **THEN** if `save_history = true`, the assistant message SHALL be persisted with `safety_flags` = `{ "risk_detected": true, "keywords": [...], "severity": N }`

#### Scenario: No risk detected
- **WHEN** neither pre-filter nor post-filter detects risk
- **THEN** the SSE stream SHALL behave identically to the current implementation (no `risk_detected` field)
