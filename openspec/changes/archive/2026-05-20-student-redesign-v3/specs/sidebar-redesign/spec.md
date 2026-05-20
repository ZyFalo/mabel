## ADDED Requirements

### Requirement: Student sidebar two states

The student `StudentSidebar.tsx` (replaces `Sidebar.tsx` for student layout) SHALL support two states: `open=true` (272px expanded with grouped conversations and user footer) and `open=false` (56px rail with vertical icons + tooltips). Transition between states SHALL animate width over 300ms `ease-out`. State SHALL persist in `localStorage` under key `mabel_sidebar_open` (default `true` on desktop, `false` on tablet, drawer on mobile). Toggle SHALL be available via Cmd+B/Ctrl+B keyboard shortcut and via a dedicated toggle button in the sidebar header.

#### Scenario: Toggle expands to 272px

Given the sidebar is at 56px (collapsed)
When the user presses Cmd+B
Then the sidebar SHALL animate to 272px width
And the expanded content (conversations list, footer) SHALL fade in

#### Scenario: State persists across reload

Given the user collapsed the sidebar
When the page reloads
Then `localStorage.getItem('mabel_sidebar_open')` SHALL be 'false'
And the sidebar SHALL render at 56px without any open-then-collapse flash

### Requirement: Collapsed sidebar rail

When `open=false`, the sidebar SHALL render a 56px rail with vertically stacked icon buttons. Each button SHALL show a tooltip on hover (custom CSS tooltip with `bg-[var(--text-strong)] text-[var(--bg)]`) AND a native `title` attribute for accessibility. The rail SHALL contain:
- Expand toggle (top)
- "Nueva conversacion" prominent button (rounded-full bg-elevated border, accent icon)
- "Buscar chats" icon button (opens expanded state)
- "Chats recientes" icon button
- "Preferencias" icon button (links to /settings)
- spacer (flex-1)
- "Configuracion" icon button (bottom)
- User avatar with initials (bottom)

#### Scenario: Tooltip shown on hover

Given the sidebar is collapsed and the cursor hovers over the "Nueva conversacion" button
When the hover persists 100ms
Then a tooltip SHALL appear to the right of the button with the text "Nueva conversacion"

#### Scenario: Click on disabled rail item

Given the rail "Buscar chats" button is clicked while collapsed
When the click fires
Then the sidebar SHALL expand to 272px AND focus the search input (if implemented)

### Requirement: Sidebar conversations grouped temporally

The expanded sidebar SHALL render conversation list grouped by temporal buckets: "Hoy", "Ayer", "Esta semana", "Hace 30 dias", "Anteriores". Group headers SHALL be uppercase `text-[10.5px] tracking-[0.08em] text-faint`. Each conversation row SHALL display the topic_hint truncated with `text-[13px]`. The active conversation SHALL have `bg-[var(--bg-active)] text-[var(--text-strong)]`.

The grouping logic SHALL be reused from the existing `Sidebar.tsx` (sessions ordered by `started_at DESC` and bucketed by date diff). If `preferences.save_history === false`, the entire list SHALL be replaced with the existing "Historial desactivado" message linking to /settings.

#### Scenario: History disabled message

Given `preferences.save_history === false`
When the sidebar renders
Then the conversation list area SHALL show a message "Historial desactivado" with a link to "/settings"
And the temporal groups SHALL NOT render

### Requirement: Sidebar user footer

When expanded, the sidebar footer (border-top, bottom of sidebar) SHALL render:
- Avatar circular 28px with linear-gradient `from accent to color-mix(in srgb, accent 60%, black)` displaying user's initials (first letter of each of the first 2 words of `display_name`)
- Display name (truncated) + email or role label below
- Separate Settings button (`<button>` with icon, links to /settings)

The clickable avatar/name area SHALL also link to /settings (or open a menu later). The Settings button SHALL be a distinct target.

#### Scenario: Initials computed correctly

Given user `display_name = "Andrea Estudiante"`
When the footer renders
Then the avatar circle SHALL contain "AE"

### Requirement: Responsive sidebar behavior

The sidebar SHALL behave responsive:
- Mobile (`<md`, < 768px): rendered as a drawer overlay (position fixed, z-50, behind a `bg-black/50` backdrop). Toggle from header hamburger button. Tap on backdrop closes. The 56px rail does NOT show on mobile.
- Tablet (`md` to `<lg`, 768-1024px): default state is collapsed (56px rail). User can toggle.
- Desktop (`>=lg`, 1024px+): default state is expanded (272px). User can toggle.

#### Scenario: Mobile drawer overlay

Given viewport width is 500px
When the user opens the sidebar via the header hamburger
Then the sidebar SHALL appear as an overlay (z-50) with a backdrop (bg-black/50)
And tapping the backdrop SHALL close it
