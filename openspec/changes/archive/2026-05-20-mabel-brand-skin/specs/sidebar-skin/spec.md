## ADDED Requirements

### Requirement: Sidebar visual matches prototype

The `StudentSidebarV3.tsx` SHALL be reskined to match `sidebar.jsx` from the prototype:
- Width 268px expanded / 60px collapsed (was 272/56)
- Background `var(--ink-50)`, right border `1px solid var(--ink-200)`
- Brand header: `<MabelLogo size={28} />` + text "Mabel" 15px bold + "UMB · Bienestar" 11px ink-400
- "Nueva sesion" button: full-width, `bg: mabel-600`, `color: white`, `padding: 10px 14px`, icon `Plus` 16px, hover `mabel-700`, with `shadow-sm`
- Nav items: "Buscar sesiones" (icon search), "Conversaciones" (icon message, active when in chat)
- Section header "HISTORIAL" uppercase 10.5px ink-400 letter-spacing 0.06em
- Session rows: title 13px bold + meta row with clock icon + "{when} · {duration}" 11px ink-400
- Active session row uses `bg: mabel-50` + `color: mabel-700`

#### Scenario: Nueva sesion button stands out

Given the sidebar is expanded
When it renders
Then the "Nueva sesion" button SHALL have `background: var(--mabel-600)` and white text
And it SHALL span the full available width minus padding

### Requirement: SOS sticky button above profile

The sidebar SHALL include a sticky "Linea de crisis SOS" button positioned IMMEDIATELY above the profile footer (border-top'd from main scroll area). Style: `bg: var(--mabel-50)`, `border: 1px solid var(--mabel-100)`, `color: var(--mabel-700)`, icon `AlertTriangle` 16px, font-weight 600, full-width with padding `10px 12px`. Click opens the existing `CrisisOverlay` (same flow as `SosFab`).

#### Scenario: SOS button visible in sidebar

Given the student is on any page with sidebar
When the sidebar renders
Then a "Linea de crisis SOS" button SHALL be visible just above the profile footer
And clicking it SHALL open the existing CrisisOverlay (no behavior change)

### Requirement: Profile menu items (UserMenu reskin)

The `UserMenu.tsx` popover items SHALL be styled per the prototype:
- Header card with name (13px bold) + email (11px ink-500)
- Items list: Configuracion (icon settings), Perfil (icon user → /settings?tab=account), Privacidad (icon shield → /settings?tab=privacy), Ayuda y soporte (icon help, deferred placeholder)
- Divider line
- Cerrar sesion item with `color: var(--mabel-700)` and `hover bg: var(--mabel-50)`

#### Scenario: Logout item styled red

Given the UserMenu is open
When the user hovers "Cerrar sesion"
Then its background SHALL be `var(--mabel-50)` and color `var(--mabel-700)`

### Requirement: Collapse toggle floating outside

The sidebar SHALL include a floating circular toggle button (`24×24` white circle with `Chevron-left`/`Chevron-right`) positioned at `top: 18px, right: -12px` (overflowing the sidebar's right edge). Border `1px solid var(--ink-200)`, shadow-sm, hover color `var(--mabel-600)`.

#### Scenario: Toggle button outside sidebar edge

Given the sidebar is rendered
When the toggle button renders
Then it SHALL be positioned with `right: -12px` (overflowing 12px outside the sidebar)
And clicking it SHALL toggle the collapsed state
