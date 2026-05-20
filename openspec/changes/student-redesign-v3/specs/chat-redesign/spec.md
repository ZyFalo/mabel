## ADDED Requirements

### Requirement: Welcome screen with time-based greeting

The `Home.tsx` page SHALL render:
- Mabel logo centered (40-48px)
- Greeting `<h1>` with Fraunces italic, `text-[34px]`, format: `"{timeGreeting}, <span class='text-accent'>{firstName}</span>"` where `timeGreeting` is "Buenos dias" (<12h), "Buenas tardes" (12-19h), "Buenas noches" (>=19h)
- Below greeting: composer (same Composer component used in Chat)
- Below composer: 2x2 grid of 4 suggestion cards (existing student suggestions: "Estoy estresado por los parciales", "Tecnicas de relajacion", "No puedo dormir bien", "Quiero hablar de como me siento")
- Each suggestion card: icon in colored chip (accent variant per card) + label, `transition-all hover:scale-110` on the icon chip on hover
- Layout: max-w-2xl centered vertically with `flex-1 flex flex-col items-center justify-center`

Clicking a suggestion SHALL pre-fill the composer text and submit (existing behavior: creates session and navigates).

#### Scenario: Time greeting at 8 AM

Given the current hour is 8
When Home renders
Then the greeting SHALL be "Buenos dias, [FirstName]"

#### Scenario: Suggestion submits message

Given the user clicks the "Estoy estresado por los parciales" suggestion
When the click fires
Then a session SHALL be created and the user SHALL navigate to chat/check-in (existing logic)

### Requirement: Composer in floating card

The `Composer` component SHALL render as a card: `bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[22px] shadow-sm`. Focus state: `focus-within:border-[var(--accent)]/60 focus-within:shadow-[0_2px_20px_-4px_var(--accent-glow)]`. Structure:
- Textarea expansive with auto-grow (`scrollHeight` up to max 200px)
- Bottom row (`px-3 pb-2.5`) with three groups:
  - Left: mic button (ASR — existing functionality, pulsing red border #DC2626 when recording), mute button (TTS toggle — existing functionality)
  - Center: empty (or future tools)
  - Right: send button (`p-2 rounded-lg bg-[var(--accent)] text-white`, disabled when empty or streaming)
- Enter to send, Shift+Enter for new line (existing behavior preserved)

The composer is reused in `Home.tsx` (welcome state) and `Chat.tsx` (active session state).

#### Scenario: Auto-grow textarea

Given the user types a 5-line message
When the textarea content changes
Then its height SHALL grow up to max 200px (then scroll internally)

#### Scenario: Mic button pulsing while recording

Given the user clicks the mic button
When the recording starts
Then the button SHALL display `animate-pulse border-2 border-[#DC2626]` AND the mic icon SHALL be red (color preserved per existing behavior)

### Requirement: Asymmetric message rendering

The `Chat.tsx` message list SHALL render messages with two distinct visual treatments:

**User messages:**
- Aligned to the right (`flex justify-end`)
- Bubble with `bg-[var(--bg-user-msg)] text-[var(--text-strong)] px-4 py-2.5 rounded-2xl rounded-br-md text-[14.5px]`
- max-width responsive: 90% (mobile), 85% (tablet), 80% (desktop)

**Assistant messages:**
- NO bubble. Full-width within container (`max-w-3xl` container).
- 28px circular avatar with Mabel logo on the LEFT (`shrink-0 mt-1`)
- Content rendered via `<Markdown>` component, `text-[15px] text-[var(--text-strong)]`
- Streaming cursor: `<span class="inline-block w-[7px] h-[15px] bg-[var(--accent)] ml-1 animate-pulse" />` appended while streaming
- Action buttons (Copy, Reportar mensaje) appear in `opacity-0 group-hover:opacity-100` below the content. Reportar mensaje preserves the existing modal + state machine.
- "Ya reportado" badge: stays visible (not hover-gated) when `reportedIds.has(msg.id)`.

The container SHALL use `max-w-3xl mx-auto px-6` with density-aware vertical padding (from `preferences.density` if implemented; otherwise `py-8 space-y-8`).

#### Scenario: Reportar appears in hover

Given an assistant message is rendered
When the user hovers over the message
Then a "Reportar" icon button SHALL appear below the content
And clicking it SHALL open the existing ReportModal (unchanged)

#### Scenario: Ya reportado badge persists

Given a message has been reported (its id is in `reportedIds`)
When the message renders
Then a "Ya reportado" badge SHALL be visible below the content regardless of hover state

#### Scenario: Streaming cursor on last assistant message

Given an assistant response is mid-stream
When the last message is rendered
Then the streaming cursor block SHALL be visible after the partial content
And it SHALL pulse using `animate-pulse`

### Requirement: Message fade-up stagger animation

Each message SHALL apply class `fade-up` with `style={{ animationDelay: ${i*30}ms }}` (i = message index). This stagger applies only on initial render of an existing conversation OR when a new message arrives.

#### Scenario: Stagger animates messages sequentially

Given a conversation with 5 messages mounts
When the list renders
Then message i=0 animates immediately, i=1 at 30ms, i=4 at 120ms

### Requirement: TopBar minimal

The chat view SHALL render a 48px top bar (`h-12 flex items-center justify-between px-3`) containing:
- Left: model name display ("Mabel IA") with Fraunces serif at 14px, optional small ChevronDown (cosmetic, non-functional in V1)
- Right: "Finalizar sesion" button (existing behavior: opens ConfirmModal then ends session)

The TopBar SHALL be hidden on the Welcome screen (Home.tsx) and visible when `hasMessages || isStreaming`.

#### Scenario: Finalizar opens existing modal

Given the user clicks "Finalizar sesion" in the TopBar
When the click fires
Then the existing `ConfirmModal` SHALL open with title "Finalizar sesion?" and behavior unchanged

### Requirement: SOS FAB preserved

The `SosFab` component (FAB rojo bottom-right, 56px, border #DC2626) SHALL be rendered in the student layout independently of the redesign. Position, color, click behavior (opens SosPanel), and crisis automatica trigger SHALL be 100% preserved. The composer redesign SHALL NOT absorb or replace the SOS FAB.

#### Scenario: SOS FAB visible regardless of state

Given any student page is rendered (Home, Chat, Settings, etc.)
When the page renders
Then the SosFab SHALL be visible at bottom-right with class `bg-white border-2 border-[#DC2626]`

#### Scenario: SOS FAB triggers existing flow

Given the user clicks the SOS FAB
When clicked
Then the existing flow fires: stop TTS, stop subtitles, open SosPanel modal, register safety_event with trigger='manual'

### Requirement: Disclaimer in footer

Below the composer in the chat view, a disclaimer SHALL appear in `text-center text-[11px] text-[var(--text-faint)]` with the text "Mabel es una asistente de psicoeducacion. No reemplaza atencion profesional. Lineas de ayuda disponibles via SOS." This replaces no existing element — it is reinforcement.

#### Scenario: Disclaimer visible under composer

Given the chat is open with messages
When the chat renders
Then the disclaimer SHALL be visible below the composer with `mt-2.5`

### Requirement: Auto-greeting preserved

When the chat mounts and the session has zero messages, the existing `POST /api/v1/sessions/:id/greeting` call SHALL fire to generate the assistant's first message. The greeting SHALL render as a normal assistant message (full-width, avatar, Markdown). No behavior change beyond visual.

#### Scenario: Auto-greeting first message

Given a new session has no messages
When Chat.tsx mounts
Then the greeting endpoint SHALL be called
And the response SHALL render as the first assistant message with `fade-up` and avatar
