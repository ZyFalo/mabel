## ADDED Requirements

### Requirement: Settings full-screen with vertical tabs

The `Settings.tsx` page SHALL render a full-screen view (no modal) with structure:
- Header (48px): title "Configuracion" (Fraunces 14.5px) + X close button (returns to previous page via `navigate(-1)` or to `/home`)
- Body: `flex flex-col md:flex-row`
  - Nav: `md:w-[220px] md:border-r border-[var(--border-subtle)]` with vertical tabs in desktop; horizontal scrollable tabs at top in mobile
  - Content: `flex-1 overflow-y-auto` with `max-w-2xl px-6 md:px-10 py-6 md:py-8`

All six existing sections SHALL be preserved (NO sections added or removed):
1. Privacidad (toggles save_history, checkin_enabled)
2. Accesibilidad (subtitles, contrast, font_size segmented)
3. Voz (TTS toggle, voice select with preview button, mode chat/avatar segmented)
4. Cuenta (email read-only, change password modal, revoke consent modal, delete account modal)
5. Mis datos / ARCO (export modal with json/csv, Ley 1581 informational text)
6. Apariencia (NEW: theme light/dark/auto segmented — links to `useTheme` from Cap 1)

#### Scenario: Tabs in desktop are vertical

Given viewport width >= 768px
When Settings renders
Then the nav SHALL be a vertical list of 6 tabs on the left at `w-[220px]`

#### Scenario: Tabs in mobile are horizontal scroll

Given viewport width < 768px
When Settings renders
Then the nav SHALL be a horizontal row at the top with `overflow-x-auto whitespace-nowrap`

#### Scenario: All existing modals work

Given the user is in the Cuenta tab
When they click "Cambiar contrasena", "Revocar consentimiento", "Eliminar cuenta", or "Exportar mis datos"
Then the existing modal (ChangePasswordModal, RevokeConsentModal, DeleteAccountModal, ArcoExportModal) SHALL open unchanged

### Requirement: Apariencia tab (theme controller)

A new "Apariencia" tab SHALL expose a Segmented control for `theme: 'light'|'dark'|'auto'` (icons Sun/Moon/Monitor from lucide-react). Selection SHALL invoke `useTheme().setTheme(value)` which:
- Updates `<html data-theme>` immediately
- Persists to `localStorage.mabel_theme`
- Persists to `preferences.accessibility.theme` via existing `updatePreferences()` (no migration needed — JSONB)

#### Scenario: Theme change is instant

Given the user selects "Dark" in the Apariencia tab
When the click fires
Then `<html>` SHALL immediately have `data-theme="dark"`
And the entire UI SHALL re-render in dark mode without page reload

### Requirement: Settings uses UI primitives

All controls in Settings SHALL be migrated from raw `<input type="checkbox">` and `<select>` to the new primitives:
- Toggle → for save_history, checkin_enabled, TTS toggle
- Segmented → for font_size (Pequena/Normal/Grande), theme (Claro/Oscuro/Auto), chat mode (Chat/Avatar)
- NativeSelect → for TTS voice selector
- Field → wrapper for all rows with label + description

Save buttons SHALL be preserved (one per section as today). API calls (`updatePreferences`, etc.) SHALL be unchanged.

#### Scenario: Toggle saves preference

Given the user toggles "Guardar historial" off
When clicking the section's "Guardar" button
Then `updatePreferences({save_history: false})` SHALL be called (existing API)

### Requirement: Settings header X closes

The header X button SHALL navigate back via `navigate(-1)` if the history stack has prior entries, otherwise to `/home`. Pressing `Esc` SHALL trigger the same close (via `useKeyboardShortcuts`).

#### Scenario: X returns to previous page

Given the user arrived at Settings from Chat
When they click X
Then the browser SHALL navigate back to the Chat page

#### Scenario: Esc closes Settings

Given Settings is open
When the user presses Esc
Then the navigation back SHALL fire (same as X click)
