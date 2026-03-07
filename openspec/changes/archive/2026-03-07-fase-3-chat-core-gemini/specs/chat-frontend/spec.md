## ADDED Requirements

### Requirement: Student Layout component
The frontend SHALL have a `StudentLayout` component that wraps all authenticated student pages.

#### Scenario: Layout structure
- **WHEN** a student page renders inside `StudentLayout`
- **THEN** it SHALL display `Header` at the top (h-14, bg-primary)
- **THEN** it SHALL display `Sidebar` on the left (220px, bg-accent #0F303A)
- **THEN** it SHALL display the page content in the remaining area (white background)
- **THEN** the sidebar SHALL be collapsible via the hamburger button in the Header
- **THEN** the collapsed/expanded state SHALL persist in localStorage

### Requirement: Sidebar del Estudiante (#34B)
The frontend SHALL have a `Sidebar` component matching Notion interface #34B.

#### Scenario: Sidebar elements
- **WHEN** the sidebar renders
- **THEN** it SHALL show a "+ Nueva sesion" button (full width, prominent)
- **THEN** it SHALL show session history grouped by date: "HOY", "AYER", "ESTA SEMANA", "ANTERIORES"
- **THEN** the active session (ended_at IS NULL) SHALL have a badge "En curso" with bg-primary (#A51916) and white text
- **THEN** finalized sessions SHALL show as secondary text with date
- **THEN** it SHALL show a "Ajustes" link with gear icon at the bottom
- **THEN** it SHALL show the user's name and partial email (e.g., j***@est.umb.edu.co)

#### Scenario: Sidebar actions
- **WHEN** the student clicks "+ Nueva sesion"
- **THEN** it SHALL call `POST /api/v1/sessions` and redirect to `/session/:id/checkin` (if `checkin_opt_in=true`) or `/session/:id/chat` (if `checkin_opt_in=false`)
- **WHEN** the student clicks an active session
- **THEN** it SHALL navigate to `/session/:id/chat`
- **WHEN** the student clicks a finalized session
- **THEN** it SHALL navigate to `/session/:id/detail`

#### Scenario: History disabled variant
- **WHEN** `preferences.save_history = false`
- **THEN** the history section SHALL show "Historial desactivado" with a link to Preferencias (/settings)
- **THEN** the "+ Nueva sesion" button SHALL still be available

#### Scenario: Session data loading
- **WHEN** the sidebar mounts
- **THEN** it SHALL call `GET /api/v1/sessions` to load the session list
- **THEN** while loading, it SHALL show a skeleton placeholder

### Requirement: Home / Dashboard del Estudiante (#08)
The frontend SHALL have a `Home` page at route `/home` matching Notion interface #08.

#### Scenario: Home elements
- **WHEN** the Home page renders
- **THEN** it SHALL show a personalized greeting: "Hola, [display_name]! En que te puedo ayudar hoy?" centered in the main area
- **THEN** it SHALL show 3-4 suggestion cards with conversation starters (e.g., "Estoy estresado por los parciales", "Tecnicas de relajacion", "No puedo dormir bien", "Quiero hablar de como me siento")
- **THEN** it SHALL show the SOS FAB button (56px circle, white bg, 2px #DC2626 border, bottom-right)

#### Scenario: Suggestion click
- **WHEN** the student clicks a suggestion card
- **THEN** it SHALL call `POST /api/v1/sessions` to create a new session
- **THEN** if `checkin_opt_in=true`, redirect to `/session/:id/checkin`
- **THEN** if `checkin_opt_in=false`, redirect to `/session/:id/chat` with the suggestion text as the first message to send
- **THEN** if `previous_session_closed=true` in the response, show toast info: "Sesion anterior finalizada automaticamente"

#### Scenario: Loading and error states
- **WHEN** the page is loading
- **THEN** it SHALL show skeleton placeholders for the suggestion cards
- **WHEN** session creation fails
- **THEN** it SHALL show an error toast

### Requirement: Check-in Pre-Session (#09)
The frontend SHALL have a `CheckIn` page at route `/session/:id/checkin` matching Notion interface #09.

#### Scenario: Check-in form elements
- **WHEN** the check-in page renders
- **THEN** it SHALL show a mood slider (0-10, required) with emoji indicators
- **THEN** it SHALL show a sleep input (0-24 hours, optional)
- **THEN** it SHALL show focus/worry category buttons (6 categories: "Academico", "Social", "Familiar", "Salud", "Economico", "Otro") — optional, single select
- **THEN** it SHALL show a notes textarea (max 500 chars, optional) with character counter
- **THEN** it SHALL show a "Continuar" button and a "Omitir" link

#### Scenario: Submit check-in
- **WHEN** the student fills the form and clicks "Continuar"
- **THEN** it SHALL validate `mood` is provided (0-10)
- **THEN** it SHALL call `PATCH /api/v1/sessions/:id` with `{ "checkin_payload": { "mood": N, "sleep": N?, "focus": "string"?, "note": "string"? } }`
- **THEN** on success, redirect to `/session/:id/chat`

#### Scenario: Skip check-in
- **WHEN** the student clicks "Omitir"
- **THEN** it SHALL redirect to `/session/:id/chat` without calling the API

### Requirement: Chat Principal (#10, without Avatar)
The frontend SHALL have a `Chat` page at route `/session/:id/chat` matching Notion interface #10 (excluding Avatar mode — Fase 9).

#### Scenario: Chat elements
- **WHEN** the chat page renders
- **THEN** it SHALL show a message area with bubbles (user right-aligned, assistant left-aligned) with timestamps
- **THEN** it SHALL show a text input (max 2000 chars) with a send button
- **THEN** it SHALL show a "Mabel esta escribiendo..." indicator during streaming
- **THEN** it SHALL show a "Finalizar sesion" button in the header area
- **THEN** it SHALL show the SOS FAB button (56px, bottom-right)
- **THEN** each assistant bubble SHALL have a report button (flag icon)
- **THEN** reported bubbles SHALL show a "Ya reportado" badge

#### Scenario: Load existing messages
- **WHEN** the chat page mounts
- **THEN** it SHALL call `GET /api/v1/sessions/:id/messages` to load existing messages
- **THEN** it SHALL scroll to the bottom of the message list
- **THEN** while loading, it SHALL show skeleton chat placeholders

#### Scenario: Send message with streaming
- **WHEN** the student types a message and clicks send (or presses Enter)
- **THEN** the input SHALL be cleared and disabled during streaming
- **THEN** it SHALL immediately show the user's message bubble
- **THEN** it SHALL call `POST /api/v1/sessions/:id/messages` with `{ "content": "text" }`
- **THEN** it SHALL read the SSE stream via `fetch` + `ReadableStream`
- **THEN** as `{"token": "..."}` events arrive, it SHALL append text to a growing assistant bubble
- **THEN** when `{"done": true, "message_id": "...", "latency_ms": N}` arrives, the bubble SHALL be finalized
- **THEN** the input SHALL be re-enabled
- **THEN** the view SHALL auto-scroll to the bottom as new text arrives

#### Scenario: Streaming error
- **WHEN** an `{"error": "..."}` SSE event is received
- **THEN** it SHALL show an error toast with the message
- **THEN** the input SHALL be re-enabled

#### Scenario: End session
- **WHEN** the student clicks "Finalizar sesion"
- **THEN** it SHALL show the confirmation modal (#37) with title "Finalizar sesion?" and message "Podras ver esta conversacion en tu historial"
- **THEN** on confirm, it SHALL call `PATCH /api/v1/sessions/:id` with `{ "action": "end" }`
- **THEN** on success, redirect to `/session/:id/end`

#### Scenario: Empty state (first message)
- **WHEN** the session has no messages yet
- **THEN** it SHALL show a greeting similar to Home: "Hola, [nombre]! Cuentame, como te sientes hoy?"

#### Scenario: Report button per bubble
- **WHEN** the student clicks the report flag on an assistant bubble
- **THEN** it SHALL open the Report Modal (#11) for that message
- **WHEN** a bubble has already been reported
- **THEN** the flag icon SHALL be replaced with a "Ya reportado" badge (muted)

#### Scenario: Message validation
- **WHEN** the student tries to send an empty message or a message exceeding 2000 chars
- **THEN** the send button SHALL be disabled

### Requirement: Modal de Reporte de Mensaje (#11)
The frontend SHALL have a `ReportModal` component matching Notion interface #11.

#### Scenario: Report form
- **WHEN** the modal opens for a message
- **THEN** it SHALL show 5 reason radio buttons: "Alucinacion" (hallucination), "Contenido danino" (harmful), "Privacidad" (privacy), "Baja empatia" (low_empathy), "Otro" (other)
- **THEN** it SHALL show a severity slider (1-5, optional)
- **THEN** it SHALL show a details textarea (max 1000 chars, optional) with character counter
- **THEN** it SHALL show "Enviar reporte" and "Cancelar" buttons

#### Scenario: Submit report
- **WHEN** the student selects a reason and clicks "Enviar reporte"
- **THEN** it SHALL validate `reason` is selected
- **THEN** it SHALL call `POST /api/v1/messages/:id/reports` with `{ "reason": "...", "severity": N?, "details": "..."? }`
- **THEN** on success (201), close modal and show success toast "Reporte enviado"
- **THEN** on 409 (duplicate), show info toast "Ya reportaste este mensaje" and close modal

### Requirement: Detalle de Sesion (#14)
The frontend SHALL have a `SessionDetail` page at route `/session/:id/detail` matching Notion interface #14.

#### Scenario: Access guard
- **WHEN** the student navigates to `/session/:id/detail`
- **THEN** it SHALL call `GET /api/v1/sessions/:id` to load session data
- **THEN** if session `ended_at IS NULL` (still active), redirect to `/session/:id/chat`
- **THEN** if session does not belong to the current user, redirect to `/403`

#### Scenario: Detail elements
- **WHEN** the session detail renders
- **THEN** it SHALL show a breadcrumb: "Home > Sesion [fecha]"
- **THEN** it SHALL show session metadata (started_at, ended_at, duration)
- **THEN** if check-in was completed, it SHALL show check-in data (mood, sleep, focus, note)
- **THEN** it SHALL show the full conversation in read-only mode (same bubble layout as chat)
- **THEN** it SHALL show a "Eliminar sesion" button
- **THEN** it SHALL show a "Volver" button that navigates to `/home`

#### Scenario: Delete session
- **WHEN** the student clicks "Eliminar sesion"
- **THEN** it SHALL open the confirmation modal (#37) with title "Eliminar sesion?" and destructive variant
- **THEN** on confirm, it SHALL call `DELETE /api/v1/sessions/:id` (NOT implemented in this phase — button visible but disabled with tooltip "Disponible proximamente")

### Requirement: Pantalla de Sesion Finalizada (#18)
The frontend SHALL have a `SessionEnd` page at route `/session/:id/end` matching Notion interface #18.

#### Scenario: Session end elements
- **WHEN** the session end page renders
- **THEN** it SHALL show an empathetic farewell message (e.g., "Gracias por conversar conmigo hoy. Recuerda que estoy aqui cuando me necesites.")
- **THEN** it SHALL show a session summary card: duration, message count, mood (from check-in if available)
- **THEN** it SHALL show a "Nueva sesion" button that creates a new session
- **THEN** it SHALL show a "Ir al inicio" button that navigates to `/home`
- **THEN** the SOS FAB SHALL be visible

### Requirement: Toast component (#36)
The frontend SHALL have a global `Toast` system matching Notion interface #36.

#### Scenario: Toast store and rendering
- **WHEN** a toast is triggered via `useToastStore.getState().addToast({ type, message })`
- **THEN** it SHALL render in the top-right corner (fixed position)
- **THEN** 4 types SHALL be supported: `success` (green), `error` (red), `info` (blue), `warning` (yellow)
- **THEN** each toast SHALL auto-dismiss after 5 seconds
- **THEN** each toast SHALL have a close button for manual dismiss
- **THEN** multiple toasts SHALL stack vertically

### Requirement: Modal de Confirmacion (#37)
The frontend SHALL have a reusable `ConfirmModal` component matching Notion interface #37.

#### Scenario: Simple variant
- **WHEN** `ConfirmModal` renders with `variant="simple"`
- **THEN** it SHALL show: overlay, title, message, "Cancelar" button, "Confirmar" button (danger style)

#### Scenario: Verification variant
- **WHEN** `ConfirmModal` renders with `variant="verification"` and `verificationText="ELIMINAR"`
- **THEN** it SHALL show an additional text input
- **THEN** the confirm button SHALL be disabled until the input matches `verificationText`

### Requirement: Skeleton Loaders (#38)
The frontend SHALL have skeleton loader components matching Notion interface #38.

#### Scenario: Skeleton variants
- **THEN** `SkeletonCard` SHALL render a rectangular placeholder with pulse animation
- **THEN** `SkeletonChat` SHALL render 3-5 alternating bubble placeholders (left/right)
- **THEN** `SkeletonText` SHALL render 2-3 lines of varying width with pulse animation
- **THEN** all skeletons SHALL use Tailwind's `animate-pulse` with `bg-gray-200` color

### Requirement: Empty States (#39)
The frontend SHALL have an `EmptyState` component matching Notion interface #39.

#### Scenario: Empty state rendering
- **WHEN** `EmptyState` renders with props `{ icon, title, description, action? }`
- **THEN** it SHALL show the icon centered, title below, description below title
- **THEN** if `action` is provided (label + onClick), it SHALL show an action button

#### Scenario: Specific variants used in this phase
- **THEN** "Sin sesiones" variant: icon=chat, title="Aun no tienes sesiones", description="Comienza tu primera conversacion con Mabel!", action="Nueva sesion"
- **THEN** "Historial desactivado" variant: icon=lock, title="Historial desactivado", description="Puedes activarlo en Preferencias.", action="Ir a Preferencias"

### Requirement: Chat Zustand store
The frontend SHALL have a `useChatStore` for managing chat state.

#### Scenario: Store state
- **THEN** `useChatStore` SHALL manage: `sessions` (list), `currentSession` (object | null), `messages` (list), `isStreaming` (bool), `streamingText` (string)
- **THEN** it SHALL provide actions: `loadSessions()`, `createSession(topicHint?)`, `loadMessages(sessionId)`, `sendMessage(sessionId, content)`, `endSession(sessionId)`

#### Scenario: Streaming action
- **WHEN** `sendMessage` is called
- **THEN** it SHALL set `isStreaming = true`
- **THEN** it SHALL read the SSE stream and update `streamingText` progressively
- **THEN** when done, it SHALL append the final message to `messages`, reset `streamingText`, and set `isStreaming = false`

### Requirement: React Router updates
The frontend SHALL add new routes for chat functionality.

#### Scenario: New routes
- **WHEN** `App.tsx` is updated
- **THEN** the following routes SHALL be added inside `ProtectedRoute` + `ConsentGuard`:
  - `/home` → `Home` (replaces `HomePlaceholder`)
  - `/session/:id/checkin` → `CheckIn`
  - `/session/:id/chat` → `Chat`
  - `/session/:id/end` → `SessionEnd`
  - `/session/:id/detail` → `SessionDetail`
- **THEN** all student routes SHALL render inside `StudentLayout`

### Requirement: SOS FAB placeholder
The frontend SHALL show an SOS FAB button on student pages.

#### Scenario: SOS FAB rendering
- **WHEN** a student page renders inside `StudentLayout`
- **THEN** it SHALL show a fixed-position FAB button at the bottom-right of the main content area
- **THEN** the FAB SHALL be a 56px circle with white background, 2px #DC2626 border, and "SOS" text in #DC2626
- **THEN** clicking the FAB SHALL show a toast info "Panel SOS — Disponible en Fase 4" (placeholder until Fase 4)
