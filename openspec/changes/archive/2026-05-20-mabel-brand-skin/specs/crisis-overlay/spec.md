## ADDED Requirements

### Requirement: Crisis overlay hero band

The `SosPanel.tsx` (renamed/repurposed `CrisisOverlay` per prototype) SHALL render:
- Backdrop: `bg: rgba(26,17,16,0.32) backdrop-blur 4px`, click outside closes
- Card: `min(100%, 720px)` max-h 92%, `bg: #fff`, `border-radius: 18px`, `border: 1px solid var(--ink-200)`, `box-shadow: var(--shadow-xl)`, `scale-in` animation
- Hero band: `bg: var(--mabel-50)`, `border-bottom: 1px solid var(--mabel-100)`, padding `32px 32px 28px`, text-center
  - X close button absolute top-right (32×32, bg white/80, border ink-200)
  - Heart icon in 56px circle (bg white, color mabel-600, shadow-sm, margin auto bottom 16)
  - Title "Estamos aqui contigo" 24px bold ink-900 letter-spacing -0.015em
  - Subtitle 14px ink-600 leading 1.55 max-width 420px center: "Si estas pasando por un momento dificil, no estas solo/a. Hay personas capacitadas listas para ayudarte ahora mismo."

#### Scenario: Hero band cream background

Given the crisis overlay is open
When the hero renders
Then its background SHALL be `var(--mabel-50)` with bottom border `1px solid var(--mabel-100)`

#### Scenario: Heart icon in circle

Given the crisis overlay is open
When the hero renders
Then a 56×56 white circle SHALL contain a Heart icon colored `var(--mabel-600)`

### Requirement: Hotline lines as cards

Below the hero band, in padding `24px 28px 28px`, the overlay SHALL render hotline lines from `system_config.sos_hotline_numbers` (preserved from existing logic). Each line in a card:
- `bg: white`, `border: 1px solid var(--ink-200)`, `border-radius: 12px`, padding 14px 16px
- LEFT: 40px circle bg `var(--mabel-50)` with phone icon color mabel-600
- CENTER: name 14px bold + number 12px ink-500
- RIGHT: "Llamar" button — `bg: mabel-600` color white, padding 8px 14px, rounded-full, font-weight 600

If no hotlines available, FALLBACK to the existing hardcoded list (Linea 106, Linea 141, UMB Bienestar).

#### Scenario: Hotline card structure

Given there is at least one hotline configured
When the overlay renders
Then each hotline SHALL appear in a white card with phone icon left and "Llamar" button right

### Requirement: Continuar con Mabel button

At the bottom of the overlay (after hotlines), a secondary action SHALL be present:
- Button "Continuar con Mabel" — outline style with border `var(--mabel-600)`, color `mabel-600`, hover bg `mabel-50`
- Click closes the overlay (returns to chat, preserves session state)

#### Scenario: Continuar button preserves chat

Given the user clicks "Continuar con Mabel"
When the click fires
Then the overlay SHALL close
And the chat session SHALL remain in its previous state (no navigation)

### Requirement: Triggers preserved

The overlay SHALL be openable by BOTH:
1. `SosFab` floating button (preserved, position bottom-right)
2. New "Linea de crisis SOS" button in sidebar (added in `sidebar-skin`)

Both triggers SHALL register the same existing safety_event with `trigger: "manual"`. Crisis automatica (riskDetected → opens overlay) ALSO preserved unchanged.

#### Scenario: SosFab still works

Given the user clicks the SosFab in any student page
When the click fires
Then the CrisisOverlay SHALL open AND a safety_event with trigger="manual" SHALL be registered (existing behavior)
