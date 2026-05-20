## ADDED Requirements

### Requirement: Settings as full-screen overlay 1100×720

The `/settings` route SHALL render a modal overlay (not a page navigation in the chat shell) on top of the current chat with:
- Backdrop: `position: absolute inset-0 z-20, bg: rgba(26,17,16,0.32), backdrop-filter: blur(4px)`
- Modal card: `min(100%, 1100px) × min(100%, 720px)`, `bg: #fff`, `border-radius: 18px`, `border: 1px solid var(--ink-200)`, `box-shadow: var(--shadow-xl)`, `fade-in` backdrop + `scale-in` card
- Click backdrop OR X closes (navigate back or to `/home`)
- Inside: LEFT 280px sidebar (`bg: var(--ink-50)`, border-right) with section list; RIGHT flex-1 area with breadcrumb header + scroll content

#### Scenario: Backdrop click closes

Given Settings overlay is open
When the user clicks the backdrop area outside the modal card
Then the overlay SHALL close (navigate back)

#### Scenario: Card animates in

Given Settings opens
When the modal mounts
Then it SHALL have `scale-in` animation applied

### Requirement: 5 sections matching Mabel functionality

The Settings overlay SHALL expose exactly 5 sections (NO Notificaciones since Mabel does not support it):

1. **Privacidad** (icon shield, "Datos y consentimiento"): Toggle save_history + Toggle checkin_enabled + ARCO info card with "Solicitar datos ARCO" button + Consentimiento warn card with "Revocar consentimiento" button
2. **Accesibilidad** (icon accessibility, "Personalizar experiencia"): Toggle alto contraste + Segmented font_size + Toggle subtitulos
3. **Voz** (icon voice, "TTS y voz del asistente"): Toggle TTS + voice select + Preview button + Segmented chat/avatar mode
4. **Cuenta** (icon user, "Seguridad y eliminacion"): Email read-only + Cambiar contrasena form inline (3 inputs + button) + Zona destructiva card with "Eliminar cuenta" button
5. **Mis datos (ARCO)** (icon database, "Tus datos personales"): Ley 1581 informational text + "Ver mis datos" button (opens ArcoExportModal)

Each section header SHALL have `<SectionHeader title="..." desc="..." />` with 22px bold title + 14px ink-500 description, separated by border-bottom.

#### Scenario: 5 sections in nav

Given the Settings overlay opens
When the LEFT sidebar renders
Then exactly 5 SettingsNavItem entries SHALL be visible
And none SHALL be labeled "Notificaciones"

### Requirement: Sidebar nav items with icon chips

Each `SettingsNavItem` row SHALL display:
- 34×34 icon chip (rounded-9) with bg `var(--ink-100)` (inactive) or `var(--mabel-100)` (active) containing 16px icon
- Title 13.5px bold + subtitle 11.5px below
- Active state: bg `mabel-50`, color `mabel-700`, chip bg `mabel-100`, chip color `mabel-700`

#### Scenario: Active section visual

Given the user clicks "Voz" tab
When the nav re-renders
Then the "Voz" row SHALL have `background: var(--mabel-50)`
And its icon chip SHALL have `background: var(--mabel-100)`

### Requirement: Breadcrumb header

The RIGHT content area SHALL have a header with `padding: 16px 28px, border-bottom 1px ink-200`:
- LEFT: breadcrumb "Ajustes / {SectionTitle}" — "Ajustes" in ink-400, separator "/" ink-300, SectionTitle in ink-800 bold
- RIGHT: X close button 32×32 rounded-8 with hover bg ink-100

#### Scenario: Breadcrumb reflects active section

Given Voz section is active
When the breadcrumb renders
Then it SHALL show "Ajustes / Voz" with "Voz" highlighted

### Requirement: Primitives reused from prototype

The Settings content SHALL use primitives (`SettingsField`, `Toggle`, `Card`, `PrimaryButton`, `SecondaryButton`, `Input`, `SaveBar`) styled per `settings.jsx`:
- `Input`: focused border `mabel-500` + `ring-mabel` glow, prefix icon support, password reveal eye
- `Toggle`: 40×22 pill, ink-200 (off) / mabel-600 (on), animated thumb 18×18 white
- `Card`: padding 18, border ink-200, radius 14, bg white
- `PrimaryButton`: mabel-600 bg + shadow-sm + hover mabel-700
- `SaveBar`: border-top ink-100 with PrimaryButton "Guardar cambios"

#### Scenario: Toggle visual matches

Given a Toggle is rendered with checked=true
When painted
Then the pill bg SHALL be `var(--mabel-600)` and the thumb SHALL be 18px white at left:20px
