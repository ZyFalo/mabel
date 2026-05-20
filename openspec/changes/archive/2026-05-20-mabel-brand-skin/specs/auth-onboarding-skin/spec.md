## ADDED Requirements

### Requirement: AuthShell split panel

The frontend SHALL provide `frontend/src/components/auth/AuthShell.tsx`:
- Container: `height: 100%, display: flex, bg: #fff, overflow: hidden`
- **LEFT panel** (`flex: 1`, padding `48px 56px`, background `linear-gradient(160deg, var(--mabel-700) 0%, var(--mabel-600) 60%, var(--mabel-800) 100%)`, color white, position relative, overflow hidden):
  - 2 decorative circles (radial-gradient white 8%/6% opacity) absolute positioned top-right and bottom-left
  - TOP: brand row with Avatar M white bg + "Mabel IA / Universidad Manuela Belt­ran" text
  - CENTER: prop `side` rendered (hero copy per screen)
  - BOTTOM: lock icon + "Tus conversaciones son cifradas y confidenciales" 12px opacity 0.7
- **RIGHT panel** (`flex: 1`, bg white, padding consistent, centered formulario max-w 420px)

On mobile (<md), the LEFT panel collapses to a smaller header (~120px height) and the form takes full width below.

#### Scenario: Gradient left panel

Given an AuthShell is rendered on desktop
When painted
Then its left panel SHALL have a 160deg linear-gradient from mabel-700 to mabel-600 to mabel-800

### Requirement: 5 auth pages restyled with AuthShell

The pages `Landing.tsx`, `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx` SHALL use `<AuthShell side={...}>` with a screen-specific hero copy:
- Landing: hero "Bienestar emocional · UMB" + tagline + CTA group (Iniciar sesion + Registrarme)
- Login: hero "Bienvenido de vuelta" + login form on the right
- Register: hero "Empieza tu camino con Mabel" + register form
- ForgotPassword / ResetPassword: hero with relevant copy + form

ALL existing form logic, validations, API calls, and routing remain unchanged.

#### Scenario: Login form behavior unchanged

Given a user submits Login form with valid credentials
When submit fires
Then the existing `POST /auth/login` SHALL execute and role-based redirect SHALL still work

### Requirement: Consent + Onboarding restyled

The pages `Consent.tsx`, `ConsentRejected.tsx`, `ConsentRequired.tsx` SHALL render in a wider card variant of AuthShell (max-w-2xl form area) to fit the legal text body. The body SHALL preserve verbatim the existing legal content.

The page `Onboarding.tsx` SHALL render the 3 steps with:
- Step indicator at top: progress bar `h-1 bg-ink-200` with `bg-mabel-600` fill (1/3, 2/3, 3/3)
- Card content using primitives (Toggle, Segmented, NativeSelect from earlier caps)
- Anterior / Siguiente / Finalizar buttons using PrimaryButton (mabel-600) and SecondaryButton (outline)
- Apply `fade-in` on step transitions

ALL existing onboarding logic (preference saves, advance/back, finalize → /home) preserved.

#### Scenario: Step indicator advances

Given the user is on step 1
When they click "Siguiente"
Then the progress bar fill SHALL animate to 2/3
And step 2 content SHALL fade-in

### Requirement: Modals restyled with prototype tokens

All 7 existing student modals (`ChangePasswordModal`, `RevokeConsentModal`, `DeleteAccountModal`, `ArcoExportModal`, `ConfirmModal`, `SessionExpiredModal`, `ReportModal`) SHALL adopt:
- Backdrop: `bg: rgba(26,17,16,0.32) backdrop-blur 4px` (matches prototype)
- Card: `bg #fff, border-radius 18px, border 1px solid ink-200, box-shadow: var(--shadow-xl), scale-in animation`
- Title: 20px bold Nunito
- Buttons: PrimaryButton (mabel-600 + shadow-sm) and outline secondary patterns
- All existing props/callbacks/state INTACT

#### Scenario: ChangePassword modal animates

Given the user opens ChangePassword from Settings
When the modal mounts
Then it SHALL apply `scale-in` over 220ms
And the backdrop SHALL have `backdrop-filter: blur(4px)`
