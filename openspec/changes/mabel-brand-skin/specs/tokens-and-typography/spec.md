## ADDED Requirements

### Requirement: Prototype tokens migrated to index.css

The frontend `index.css` SHALL define the exact CSS variables from `docs/design-references/mabel-brand-skin/prototype-tokens.css`: brand ramp `--mabel-50..900` (with `--mabel-600 = #A51916`), warm neutrals `--ink-50..900`, cool grays `--gray-50..700`, semantic colors (success/warn/danger/info at 50/200/600/700), spacing 4px grid `--space-1..13`, radius scale `--r-xs..3xl`, shadows including `--shadow-brand`, focus rings `--ring-mabel` and `--ring-danger`, motion `--ease-out` `--ease-in-out` `--dur-fast/base/slow`. The previous `--bg`, `--bg-elevated`, `--bg-sidebar` aliases are NO LONGER used — code SHALL migrate to direct prototype var names.

#### Scenario: Brand red token matches prototype

Given the app loads
When a CSS rule reads `var(--mabel-600)`
Then the resolved color SHALL be `#A51916`

#### Scenario: Warm ink scale present

Given the app loads
When CSS reads `var(--ink-50)` and `var(--ink-900)`
Then they SHALL be `#FAF8F7` and `#1A1110` respectively

### Requirement: Nunito replaces Fraunces

The frontend SHALL load `Nunito` (weights 400-800) from Google Fonts via `index.css`. Fraunces SHALL be removed entirely. The CSS variable `--font-sans` SHALL be `'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif`. The `--font-ui` variable SHALL be `'Inter', system-ui, sans-serif`. The `.font-display` utility SHALL use `var(--font-sans)`.

#### Scenario: Nunito loads

Given the app loads
When an element with `class="font-display"` renders
Then `getComputedStyle(el).fontFamily` SHALL contain `Nunito`
And SHALL NOT contain `Fraunces`

### Requirement: Animations preserved

The fade-up / fade-in / scale-in animations from Cap 1 (design-system-v3) SHALL be preserved verbatim in `index.css`. The fadeUp keyframe specifically SHALL use `from { opacity: 0; transform: translateY(6px); }` (prototype value, not the previous 8px).

#### Scenario: fade-up tweaked

Given an element with `.fade-up` mounts
When the animation runs
Then the initial transform SHALL be `translateY(6px)` per prototype
