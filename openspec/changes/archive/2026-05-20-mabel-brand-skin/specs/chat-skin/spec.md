## ADDED Requirements

### Requirement: Home (Chat Empty) hero

The `Home.tsx` page SHALL render:
- Centered layout `flex-1 flex flex-col items-center justify-center padding 32px 24px`
- Avatar M circular size 56px with `box-shadow: var(--shadow-brand)`
- Greeting `<h1>` 32px bold, ink-900, line-height 1.15, letter-spacing -0.02em: `"Hola, {firstName}."`
- Subtitle 16px ink-500, max-width 540px center: `"Soy Mabel, tu asistente de bienestar en la UMB. Este es un espacio seguro y confidencial. ¿Por dónde quieres empezar?"`
- Composer (see Composer requirement below) integrated below greeting
- Below composer: 4 suggestion chips PILLS in `flex flex-wrap gap-2 justify-center`
- Footer below chips: lock icon 12px + "Conversaciones cifradas · Mabel no reemplaza la atención profesional" in 12px ink-400

The 4 chips (existing Mabel content):
- `Heart`: "Cómo me siento hoy"
- `MessageCircle`: "Quiero hablar de algo"
- `Brain`: "Tengo estrés académico"
- `Sparkles`: "Necesito motivación"

Clicking a chip SHALL pre-fill the composer with the existing flow (createSession + navigate).

#### Scenario: Avatar with brand shadow

Given Home renders
When the avatar M renders
Then it SHALL have `box-shadow: var(--shadow-brand)`

#### Scenario: Subtitle text preserved verbatim

Given Home renders
When the subtitle renders
Then it SHALL contain "Soy Mabel, tu asistente de bienestar en la UMB"

### Requirement: Composer with prototype styling

The `Composer` component SHALL be restyled:
- Card with `background: #fff`, `border: 1px solid var(--ink-200)` (focused: `var(--mabel-300)`), `border-radius: 20px`, `box-shadow: var(--shadow-sm)` (focused: `var(--ring-mabel) + shadow-sm`), `padding: 14px 16px 10px`
- Textarea auto-grow max 200px, 15px Nunito, line-height 1.5
- Bottom row with LEFT group (Paperclip + Mic buttons, 34×34px, hover bg ink-100) and RIGHT group (small hint "↵ para enviar" 11px ink-400 + send button)
- Send button: 34×34 circle, `bg: var(--mabel-600)` (active) or `var(--ink-200)` (disabled), icon `ArrowRight` 16px white. Hover `mabel-700`.

The hint "↵ para enviar" SHALL only appear when there is space (responsive — can hide on mobile).

#### Scenario: Send button is a red circle

Given the composer has text and is not disabled
When it renders
Then the send button SHALL be a 34×34 circle with `background: var(--mabel-600)` and contain an `ArrowRight` icon

#### Scenario: Focus ring around composer

Given the textarea is focused
When focus is active
Then the composer card SHALL have `box-shadow: var(--ring-mabel)` (3px rgba accent ring) + base shadow-sm

### Requirement: Asymmetric message bubbles

The Chat.tsx message render SHALL use these EXACT styles:

**User message:**
- Container: `flex justify-end gap-12px (row-reverse), align-items-flex-start, margin-bottom 22px`
- Bubble: max-width `min(560px, 75%)`, padding `11px 15px`, `border-radius: 18px 18px 4px 18px`, `background: var(--mabel-600)`, color white, font-size 14.5px line-height 1.55, `box-shadow: var(--shadow-xs)`. NO avatar.
- Timestamp below bubble: 11px ink-400, right-aligned

**Assistant message:**
- Container: `flex gap-12px, align-items-flex-start, margin-bottom 22px`
- Avatar M circular 32px on LEFT (not 28px)
- Bubble: same max-width/padding/font/box-shadow, `border-radius: 4px 18px 18px 18px`, `background: #fff`, `border: 1px solid var(--ink-200)`, color `var(--ink-900)`
- Timestamp below bubble: 11px ink-400, left-aligned
- Content rendered via `<Markdown />`
- Streaming cursor: small block `bg: var(--mabel-600)` `w: 7px h: 15px animate-pulse` appended
- Hover actions (Copy, Report or "Ya reportado") fade in below bubble

#### Scenario: User bubble corners

Given a user message renders
When the bubble paints
Then its `border-radius` SHALL be `18px 18px 4px 18px` exactly
And the background SHALL be `var(--mabel-600)`

#### Scenario: Assistant has avatar before bubble

Given an assistant message renders
When it paints
Then a 32px circular avatar with "M" SHALL appear to the left of the bubble

### Requirement: ChatActive session header

The active conversation in Chat.tsx SHALL include a session header bar above the messages:
- padding `14px 24px`, `border-bottom: 1px solid var(--ink-200)`, `background: rgba(255,255,255,0.7) backdrop-blur 8px`
- LEFT: session title 14.5px bold + green "Activa" badge (text 10.5px success-700, bg success-50, padding 2px 8px, radius full, with green dot)
- RIGHT: two icon buttons (`voice` for modo voz, `more` for menu — placeholders)

`Finalizar sesion` SHALL move from the previous TopBar to the "more" menu OR stay as a top-bar action (implementer choice — preserve existing modal/handler).

#### Scenario: Active badge visible

Given an active session is open with messages
When the header renders
Then a green "Activa" pill SHALL be visible next to the session title

### Requirement: Disclaimer in chat footer

Below the composer in ChatActive, a footer SHALL contain the same Mabel disclaimer (lock icon + "Mabel es psicoeducativa. No reemplaza atencion profesional. Lineas de ayuda disponibles via SOS.") at 12px ink-400.

#### Scenario: Disclaimer present

Given a chat is active
When the chat renders
Then the disclaimer footer with the lock icon SHALL be visible below the composer
