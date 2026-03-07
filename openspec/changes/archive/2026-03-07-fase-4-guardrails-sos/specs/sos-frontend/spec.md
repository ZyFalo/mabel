## ADDED Requirements

### Requirement: Panel SOS component (#12)
The frontend SHALL have a `SosPanel` overlay component matching Notion interface #12.

#### Scenario: Panel SOS elements
- **WHEN** the SOS panel opens
- **THEN** it SHALL show a semi-transparent overlay covering the entire screen
- **THEN** it SHALL show a prominent centered panel with:
  - Title: "Estamos aqui para ayudarte"
  - Empathetic warm message
  - Hotline buttons loaded from `GET /api/v1/system-config/sos` — each with `name` and `number`, rendered as `<a href="tel:NUMBER">` buttons
  - Link to external resources
  - "Volver al chat" button
  - Close button (X)
- **THEN** it SHALL NOT close the session — the student can return to chat

#### Scenario: Manual activation
- **WHEN** the student clicks the SOS FAB button
- **THEN** it SHALL open the SOS panel
- **THEN** it SHALL call `POST /api/v1/safety-events` with `{ "event_type": "redirect_shown", "payload": { "trigger": "manual", "lines_shown": [...] } }`

#### Scenario: Automatic activation from SSE
- **WHEN** the SSE stream includes `risk_detected: true` in the first event
- **THEN** it SHALL stop any playing audio (TTS or any `<audio>` element) before opening the panel
- **THEN** it SHALL automatically open the SOS panel
- **THEN** it SHALL call `POST /api/v1/safety-events` with `{ "event_type": "redirect_shown", "payload": { "trigger": "auto", "lines_shown": [...] } }`

#### Scenario: Loading hotline numbers
- **WHEN** the SOS panel mounts
- **THEN** it SHALL call `GET /api/v1/system-config/sos`
- **THEN** it SHALL render each hotline as a button with phone icon and `tel:` link
- **THEN** if the API call fails, it SHALL show a fallback message with the default numbers hardcoded

### Requirement: SOS FAB upgrade
The frontend SHALL replace the SOS FAB placeholder with a real implementation.

#### Scenario: SOS FAB behavior
- **WHEN** `SosFab` is clicked
- **THEN** it SHALL open the `SosPanel` overlay (NOT show a toast placeholder)
- **THEN** the FAB SHALL remain visible on all student pages inside `StudentLayout`

### Requirement: Error de Conexion component (#20)
The frontend SHALL have a `ConnectionError` component matching Notion interface #20.

#### Scenario: Connection error display
- **WHEN** an API call fails with a network error (no response)
- **THEN** it SHALL show an inline error in the content area with:
  - Disconnection icon
  - Title: "Sin conexion"
  - Message: "Revisa tu conexion a Internet. Mabel IA necesita conexion para funcionar."
  - "Reintentar" button
- **THEN** the header and sidebar SHALL remain visible (layout preserved)

#### Scenario: Automatic retry with exponential backoff
- **WHEN** the connection error appears
- **THEN** it SHALL automatically retry after 3 seconds
- **THEN** if retry fails, wait 6 seconds, then 12, then 24, then cap at 30 seconds
- **THEN** each retry SHALL show a countdown timer
- **THEN** clicking "Reintentar" SHALL reset the backoff timer and retry immediately

### Requirement: Session Expired JWT modal (#21)
The frontend SHALL have a `SessionExpiredModal` component matching Notion interface #21.

#### Scenario: JWT expiration detection
- **WHEN** the axios interceptor receives a 401 response
- **THEN** before clearing auth state, it SHALL save the current chat textarea value to `localStorage.setItem('mabel_draft', text)`
- **THEN** it SHALL show a blocking modal with:
  - Overlay (non-dismissible)
  - Title: "Sesion expirada"
  - Message: "Tu sesion ha expirado. Por favor, inicia sesion nuevamente."
  - "Ir al login" button
- **THEN** clicking "Ir al login" SHALL clear auth state and navigate to `/login`

#### Scenario: Draft preservation
- **WHEN** the student returns to `/session/:id/chat` after re-login
- **THEN** it SHALL check `localStorage.getItem('mabel_draft')`
- **THEN** if a draft exists, it SHALL pre-fill the textarea and remove the draft from localStorage
- **THEN** it SHALL show an info toast: "Tu borrador fue recuperado"

### Requirement: Chat integration with risk detection
The frontend Chat page SHALL handle risk detection from SSE.

#### Scenario: Risk detected in SSE stream
- **WHEN** an SSE event contains `"risk_detected": true`
- **THEN** the Chat page SHALL automatically open the `SosPanel`
- **THEN** streaming SHALL continue normally (Mabel's empathetic response is still shown)
- **THEN** after the SOS panel is closed, the student can continue chatting

#### Scenario: Post-filter risk in done event
- **WHEN** the SSE `done` event contains `"risk_detected": true`
- **THEN** the Chat page SHALL automatically open the `SosPanel`
