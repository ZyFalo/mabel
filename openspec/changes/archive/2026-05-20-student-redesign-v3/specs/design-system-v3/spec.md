## ADDED Requirements

### Requirement: CSS variables tokens

The frontend SHALL define design tokens as CSS variables on the `<html>` element, switched via the `data-theme="light"|"dark"` attribute. Tailwind utility classes SHALL consume them via arbitrary value notation (`bg-[var(--bg-elevated)]`, `text-[var(--text-strong)]`, etc.). All existing UMB tokens (primary, accent, danger, success, warning) SHALL be available as CSS variables.

#### Scenario: Theme switches via data-theme

Given the `<html>` element has `data-theme="dark"`
When a component uses `bg-[var(--bg-elevated)]`
Then it SHALL render with the dark palette value (#2A2823)

#### Scenario: Light theme defaults

Given no `data-theme` attribute is set
When the page loads
Then `data-theme="light"` SHALL be applied and the light palette SHALL render

### Requirement: Light/dark/auto theme

The frontend SHALL provide a `useTheme()` hook that exposes `{theme, setTheme, resolvedTheme}` where `theme: 'light'|'dark'|'auto'` and `resolvedTheme: 'light'|'dark'`. When `theme='auto'`, the hook SHALL read `prefers-color-scheme` and react to changes via a media-query listener. The preference SHALL persist to `localStorage` under key `mabel_theme` AND to `preferences.accessibility.theme` (JSONB) when the user is authenticated.

#### Scenario: Auto reflects system preference

Given the user OS is in dark mode
When the theme is set to 'auto'
Then `resolvedTheme` SHALL be 'dark'
And `<html>` SHALL have `data-theme="dark"`

#### Scenario: Manual selection persists

Given the user selects 'dark' in Settings
When the page reloads
Then `localStorage.getItem('mabel_theme')` SHALL be 'dark'
And the page SHALL render in dark mode immediately (no flash of light theme)

### Requirement: Font loading

The frontend SHALL load Fraunces (variable, opsz 9-144, weights 300-500 ital,non-ital) and Inter (already present) via Google Fonts with `display: swap`. Fraunces SHALL be applied via `font-family: 'Fraunces', serif` to elements with class `font-display` or explicit style attribute. Inter remains the default body font.

#### Scenario: Fraunces applies to titulars

Given an `<h1 class="font-display italic">` element
When rendered
Then `getComputedStyle(el).fontFamily` SHALL contain 'Fraunces'

### Requirement: Global animations

The frontend `index.css` SHALL define keyframes `fadeUp`, `fadeIn`, `scaleIn`, `streamingPulse` and utility classes `.fade-up`, `.fade-in`, `.scale-in`. All animations SHALL be disabled under `@media (prefers-reduced-motion: reduce)`.

#### Scenario: Reduced motion respected

Given user OS has `prefers-reduced-motion: reduce`
When an element with `.fade-up` mounts
Then the element SHALL appear without animation (opacity 1, no transform)

### Requirement: UI primitives library

The frontend SHALL provide reusable primitives in `components/ui/`:
- `Toggle({checked, onChange, disabled})` — animated switch
- `Segmented({options, value, onChange})` — button group with optional icon
- `Slider({value, onChange, min, max, step, format})` — range custom
- `Field({label, description, vertical, children})` — wrapper row
- `NativeSelect({value, onChange, children})` — select with custom chevron
- `Markdown({text})` — renderer for **bold**, `code`, numbered/bulleted lists, paragraphs, links

#### Scenario: Toggle toggles state

Given a `<Toggle checked={false} onChange={fn} />`
When the user clicks it
Then `fn(true)` SHALL be called
And the visual SHALL animate the thumb to the right with `bg-[var(--accent)]`

#### Scenario: Markdown renders bold

Given `<Markdown text="hola **mundo**" />`
When rendered
Then the output SHALL contain `<strong>mundo</strong>` with `text-[var(--text-strong)]`

#### Scenario: Markdown renders numbered list

Given input `1. uno\n2. dos`
When rendered
Then the output SHALL be an `<ol>` with two `<li>` items, each prefixed by `1.` / `2.` colored with `--accent`

### Requirement: Keyboard shortcuts hook

The frontend SHALL provide `useKeyboardShortcuts(shortcuts)` hook where `shortcuts` is a record `{ 'cmd+b': fn, 'cmd+,': fn, 'esc': fn }`. The hook SHALL detect `metaKey OR ctrlKey + key` (cross-platform) and prevent default. The hook SHALL respect input focus — shortcuts SHALL NOT fire when typing in `<input>` or `<textarea>` UNLESS explicitly opted in.

#### Scenario: Cmd+B toggles sidebar

Given the StudentLayout registers `'cmd+b': toggleSidebar`
When the user presses Cmd+B on macOS or Ctrl+B on Windows/Linux
Then `toggleSidebar()` SHALL be called

#### Scenario: Shortcut respects input focus

Given the cursor is in a textarea
When the user presses Cmd+B
Then the shortcut SHALL NOT fire (sidebar state unchanged)
